const express = require('express');
const { addonBuilder } = require('stremio-addon-sdk');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cors = require('cors');
const app = express();

// إعداد المجلدات
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

// المانيفست - تم حل مشكلة catalogs
const manifest = {
    id: "org.abdullah.pro.system.v1",
    version: "1.0.0",
    name: "Sub Abdullah Ultimate",
    description: "إدارة الترجمة - IMDb & Kitsu",
    resources: ["subtitles"],
    types: ["movie", "series", "anime"],
    idPrefixes: ["tt", "kitsu"],
    catalogs: [] 
};

const builder = new addonBuilder(manifest);

builder.defineSubtitlesHandler(async (args) => {
    try {
        const parts = args.id.split(':');
        const cleanId = parts[0];
        let name = "Unknown";
        let poster = "";

        // جلب من IMDb (عن طريق Cinemeta)
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

        // جلب من Kitsu (للأنمي)
        if (name === "Unknown" || cleanId.startsWith('kitsu')) {
            try {
                const kitsuId = cleanId.replace('kitsu:', '');
                const kRes = await axios.get(`https://kitsu.io/api/edge/anime/${kitsuId}`, { timeout: 3000 });
                if (kRes.data && kRes.data.data) {
                    const animeName = kRes.data.data.attributes.canonicalTitle;
                    poster = kRes.data.data.attributes.posterImage.medium;
                    if (parts[1]) {
                        const epRes = await axios.get(`https://kitsu.io/api/edge/episodes?filter[mediaId]=${kitsuId}&filter[number]=${parts[1]}`, { timeout: 2000 });
                        if (epRes.data && epRes.data.data[0]) {
                            const epAttr = epRes.data.data[0].attributes;
                            name = `${animeName} - ${epAttr.canonicalTitle || 'الحلقة ' + parts[1]}`;
                            if (epAttr.thumbnail) poster = epAttr.thumbnail.original;
                        } else {
                            name = `${animeName} - الحلقة ${parts[1]}`;
                        }
                    } else {
                        name = animeName;
                    }
                }
            } catch (e) { console.log("Kitsu Error"); }
        }

        // تحديث التاريخ
        const newEntry = {
            id: args.id,
            name: name,
            poster: poster || `https://images.metahub.space/poster/medium/${cleanId}/img`,
            type: args.type,
            time: new Date().toLocaleTimeString('ar-SA')
        };
        history = [newEntry, ...history.filter(h => h.id !== args.id)].slice(0, 15);
        saveData();
    } catch (err) { console.log("Global Error"); }

    const subs = db.filter(s => s.id === args.id).map(s => ({
        id: s.url,
        url: s.url,
        lang: "ara",
        label: s.label
    }));
    return { subtitles: subs };
});

// التصميم
const style = `
<style>
    :root { --main: #1a1a2e; --accent: #e94560; --bg: #16213e; }
    body { background: var(--bg); color: #fff; font-family: 'Segoe UI', sans-serif; margin: 0; direction: rtl; }
    .nav { background: var(--main); padding: 15px 5%; display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid var(--accent); }
    .container { max-width: 1100px; margin: 2rem auto; padding: 0 20px; display: grid; grid-template-columns: 2fr 1fr; gap: 20px; }
    .card { background: var(--main); border-radius: 12px; padding: 25px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
    .item-row { display: flex; align-items: center; padding: 15px; border-bottom: 1px solid #24344d; transition: 0.3s; }
    .item-row:hover { background: #1f1f3a; }
    .poster { width: 70px; height: 100px; border-radius: 8px; object-fit: cover; margin-left: 20px; box-shadow: 0 5px 15px rgba(0,0,0,0.3); }
    .btn { background: var(--accent); color: white; text-decoration: none; padding: 10px 20px; border-radius: 6px; font-weight: bold; border: none; cursor: pointer; display: inline-block; }
    .sidebar-link { display: block; padding: 12px; color: #4ecca3; text-decoration: none; border-bottom: 1px solid #24344d; font-weight: bold; }
    input { width: 100%; padding: 10px; background: #0f3460; color: #fff; border: 1px solid #16213e; border-radius: 5px; }
</style>
`;

// مسارات الواجهة
app.get('/', (req, res) => {
    let rows = history.map(h => `
        <div class="item-row">
            <img src="${h.poster}" class="poster">
            <div style="flex-grow:1">
                <h3 style="margin:0 0 5px 0; font-size:1.1rem;">${h.name}</h3>
                <code style="color:#aaa; font-size:0.8rem;">${h.id}</code>
            </div>
            <a href="/upload-page/${encodeURIComponent(h.id)}" class="btn">رفع ترجمة</a>
        </div>
    `).join('');

    res.send(`${style}
        <div class="nav"><h2>Abdullah Control Panel</h2></div>
        <div class="container">
            <div class="card">
                <h2 style="margin-top:0;">📺 النشاط الأخير</h2>
                ${rows || '<p style="color:#888;">شغل أي فيلم أو حلقة في ستريميو لتظهر هنا...</p>'}
            </div>
            <div class="card">
                <h3>⚙️ الإعدادات</h3>
                <p>رابط الإضافة الخاص بك:</p>
                <input readonly value="https://${req.get('host')}/manifest.json">
                <br><br>
                <a href="stremio://${req.get('host')}/manifest.json" class="btn" style="width:100%; text-align:center;">تثبيت في ستريميو</a>
                <hr style="border:0; border-top:1px solid #24344d; margin:20px 0;">
                <a href="/admin" class="sidebar-link">📂 ملفاتك المرفوعة (${db.length})</a>
            </div>
        </div>
        <script>setTimeout(()=>location.reload(), 20000);</script>
    `);
});

app.get('/upload-page/:id', (req, res) => {
    const item = history.find(h => h.id === req.params.id);
    res.send(`${style}<div class="card" style="max-width:500px; margin:100px auto;">
        <h2 style="text-align:center;">رفع ملف ترجمة</h2>
        <p style="text-align:center; color:#aaa;">المحتوى: ${item ? item.name : req.params.id}</p>
        <form action="/upload" method="POST" enctype="multipart/form-data">
            <input type="hidden" name="imdbId" value="${req.params.id}">
            <div style="background:#0f3460; padding:20px; border-radius:8px; text-align:center; margin:20px 0;">
                <input type="file" name="subFile" accept=".srt" required>
            </div>
            <button type="submit" class="btn" style="width:100%; padding:15px; font-size:1.1rem;">تأكيد الرفع والارسال ✅</button>
        </form>
        <br><a href="/" style="color:#aaa; display:block; text-align:center;">إلغاء</a>
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
    let list = db.map((item, i) => `
        <div class="item-row">
            <div style="flex-grow:1"><b>${item.id}</b></div>
            <a href="/delete/${i}" style="color:#ff4d4d; font-weight:bold; text-decoration:none;">حذف</a>
        </div>
    `).join('');
    res.send(`${style}<div class="container"><div class="card" style="grid-column: span 2;">
        <h2>📂 الملفات المرفوعة</h2>
        ${list || '<p>لا توجد ملفات مرفوعة حالياً.</p>'}
        <br><a href="/" class="btn">العودة للرئيسية</a>
    </div></div>`);
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
app.listen(port, () => console.log(`Server is running on port ${port}`));
