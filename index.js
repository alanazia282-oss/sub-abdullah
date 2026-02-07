const express = require('express');
const { addonBuilder } = require('stremio-addon-sdk');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cors = require('cors');
const app = express();

// إعداد المجلدات وقاعدة البيانات
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
const subDir = path.join(__dirname, 'subtitles');
if (!fs.existsSync(subDir)) fs.mkdirSync(subDir);

const DB_FILE = path.join(DATA_DIR, 'db.json');
const HISTORY_FILE = path.join(DATA_DIR, 'history.json');

let db = fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE)) : [];
let history = fs.existsSync(HISTORY_FILE) ? JSON.parse(fs.readFileSync(HISTORY_FILE)) : [];

const saveData = () => {
    fs.writeFileSync(DB_FILE, JSON.stringify(db));
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(history));
};

const upload = multer({ dest: 'subtitles/' });
app.use(cors());
app.use(express.json());
app.use('/download', express.static('subtitles'));

const manifest = {
    id: "org.abdullah.pro.system.v1",
    version: "1.0.0",
    name: "Sub Abdullah Ultimate",
    description: "نظام إدارة الترجمة - IMDb & Kitsu",
    resources: ["subtitles"],
    types: ["movie", "series", "anime"],
    idPrefixes: ["tt", "kitsu"]
};

const builder = new addonBuilder(manifest);

// معالج طلبات الترجمة وجلب البيانات
builder.defineSubtitlesHandler(async (args) => {
    try {
        const parts = args.id.split(':');
        const cleanId = parts[0];
        let name = "Unknown";
        let poster = "";

        // 1. جلب من IMDb (Cinemeta)
        if (cleanId.startsWith('tt')) {
            try {
                const res = await axios.get(`https://v3-cinemeta.strem.io/meta/${args.type}/${cleanId}.json`, { timeout: 3000 });
                if (res.data && res.data.meta) {
                    const meta = res.data.meta;
                    if (args.type === 'series' && parts[1] && parts[2]) {
                        const ep = meta.videos.find(v => v.season == parts[1] && v.number == parts[2]);
                        name = ep ? `${meta.name} - ${ep.title}` : meta.name;
                        poster = (ep && ep.thumbnail) ? ep.thumbnail : meta.poster;
                    } else {
                        name = meta.name;
                        poster = meta.poster;
                    }
                }
            } catch (e) { console.log("IMDb Error"); }
        }

        // 2. جلب من Kitsu (للأنمي)
        if (name === "Unknown" || cleanId.startsWith('kitsu')) {
            try {
                const kitsuId = cleanId.replace('kitsu:', '');
                const kRes = await axios.get(`https://kitsu.io/api/edge/anime/${kitsuId}`, { timeout: 3000 });
                if (kRes.data && kRes.data.data) {
                    const animeName = kRes.data.data.attributes.canonicalTitle;
                    poster = kRes.data.data.attributes.posterImage.medium;
                    if (parts[1]) { // للحلقات
                        const epRes = await axios.get(`https://kitsu.io/api/edge/episodes?filter[mediaId]=${kitsuId}&filter[number]=${parts[1]}`, { timeout: 2000 });
                        if (epRes.data && epRes.data.data[0]) {
                            const epAttr = epRes.data.data[0].attributes;
                            name = `${animeName} - ${epAttr.canonicalTitle || 'Ep ' + parts[1]}`;
                            if (epAttr.thumbnail) poster = epAttr.thumbnail.original;
                        } else {
                            name = `${animeName} - Episode ${parts[1]}`;
                        }
                    } else {
                        name = animeName;
                    }
                }
            } catch (e) { console.log("Kitsu Error"); }
        }

        // تحديث السجل
        const newEntry = {
            id: args.id,
            name: name,
            poster: poster || `https://images.metahub.space/poster/medium/${cleanId}/img`,
            type: args.type,
            season: parts[1] || null,
            episode: parts[2] || null
        };

        history = [newEntry, ...history.filter(h => h.id !== args.id)].slice(0, 15);
        saveData();
    } catch (err) { console.log("Global Error"); }

    return { subtitles: db.filter(s => s.id === args.id) };
});

// التصميم والواجهة
const style = `
<style>
    :root { --main: #1a1a2e; --accent: #0f3460; --text: #e9ecef; }
    body { background: #16213e; color: var(--text); font-family: 'Segoe UI', sans-serif; margin: 0; direction: rtl; }
    .nav { background: var(--main); padding: 15px 5%; display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid var(--accent); }
    .container { max-width: 1100px; margin: 2rem auto; padding: 0 20px; display: grid; grid-template-columns: 2fr 1fr; gap: 20px; }
    .card { background: var(--main); border-radius: 10px; padding: 20px; box-shadow: 0 4px 15px rgba(0,0,0,0.3); }
    .item-row { display: flex; align-items: center; padding: 12px; border-bottom: 1px solid #24344d; }
    .poster { width: 60px; height: 85px; border-radius: 5px; object-fit: cover; margin-left: 15px; }
    .btn { background: #e94560; color: white; text-decoration: none; padding: 8px 15px; border-radius: 5px; font-weight: bold; border: none; cursor: pointer; }
    .sidebar-link { display: block; padding: 10px; color: #4ecca3; text-decoration: none; border-bottom: 1px solid #24344d; }
</style>
`;

app.get('/', (req, res) => {
    let rows = history.map(h => `
        <div class="item-row">
            <img src="${h.poster}" class="poster">
            <div style="flex-grow:1">
                <h4 style="margin:0">${h.name}</h4>
                <small style="color:#888">${h.type} | ${h.id}</small>
            </div>
            <a href="/upload-page/${encodeURIComponent(h.id)}" class="btn">رفع ترجمة</a>
        </div>
    `).join('');

    res.send(`${style}
        <div class="nav"><h2>Abdullah Subtitles</h2></div>
        <div class="container">
            <div class="card">
                <h3>النشاط الأخير (ستريميو)</h3>
                ${rows || '<p>شغل شي في ستريميو...</p>'}
            </div>
            <div class="card">
                <h4>الإعدادات</h4>
                <p>رابط الإضافة:</p>
                <input style="width:100%; padding:5px; background:#0f3460; color:white; border:none;" readonly value="https://${req.get('host')}/manifest.json">
                <br><br>
                <a href="stremio://${req.get('host')}/manifest.json" class="btn" style="display:block; text-align:center;">تثبيت الإضافة</a>
                <hr>
                <a href="/admin" class="sidebar-link">📂 المرفوعات (${db.length})</a>
            </div>
        </div>
        <script>setTimeout(()=>location.reload(), 20000);</script>
    `);
});

app.get('/upload-page/:id', (req, res) => {
    const item = history.find(h => h.id === req.params.id);
    res.send(`${style}<div class="card" style="max-width:450px; margin:100px auto;">
        <h3 style="text-align:center;">رفع ترجمة لـ ${item ? item.name : req.params.id}</h3>
        <form action="/upload" method="POST" enctype="multipart/form-data">
            <input type="hidden" name="imdbId" value="${req.params.id}">
            <input type="file" name="subFile" accept=".srt" required style="margin:20px 0;">
            <button type="submit" class="btn" style="width:100%;">تأكيد الرفع</button>
        </form>
    </div>`);
});

app.post('/upload', upload.single('subFile'), (req, res) => {
    if (req.file) {
        const subUrl = `https://${req.get('host')}/download/${req.file.filename}`;
        db.push({ id: req.body.imdbId, url: subUrl, label: "ترجمة عبدالله" });
        saveData();
    }
    res.redirect('/');
});

app.get('/admin', (req, res) => {
    let list = db.map((item, i) => `<div class="item-row"><div style="flex-grow:1">${item.id}</div><a href="/delete/${i}" style="color:red;">حذف</a></div>`).join('');
    res.send(`${style}<div class="container"><div class="card"><h3>الملفات المرفوعة</h3>${list}<br><a href="/" class="btn">رجوع</a></div></div>`);
});

app.get('/delete/:index', (req, res) => {
    db.splice(req.params.index, 1);
    saveData();
    res.redirect('/admin');
});

// مسارات ستريميو
app.get('/manifest.json', (req, res) => res.json(manifest));
app.get('/subtitles/:type/:id/:extra?.json', (req, res) => {
    const subs = db.filter(s => s.id === req.params.id).map(s => ({
        id: s.url,
        url: s.url,
        lang: "ara",
        label: s.label
    }));
    res.json({ subtitles: subs });
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log("Server Running..."));
