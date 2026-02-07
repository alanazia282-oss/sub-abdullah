const express = require('express');
const { addonBuilder } = require('stremio-addon-sdk');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cors = require('cors');

const app = express();

// --- إعداد البيانات ---
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

// --- Stremio Manifest ---
const manifest = {
    id: "org.abdullah.pro.system.v1",
    version: "1.1.0",
    name: "Sub Abdullah Ultimate",
    description: "نظام إدارة الترجمة - يدعم الأفلام والمسلسلات والأنمي",
    resources: ["subtitles"],
    types: ["movie", "series", "anime"],
    idPrefixes: ["tt", "kitsu"],
    catalogs: [] 
};

const builder = new addonBuilder(manifest);

// --- معالج طلبات الترجمة (هنا يتم تسجيل العمل في الموقع) ---
builder.defineSubtitlesHandler(async (args) => {
    const fullId = args.id;
    const cleanId = fullId.split(':')[0];

    // 1. تسجيل العمل فوراً في الـ History ليظهر في الموقع
    let existingEntry = history.find(h => h.id === fullId);
    if (!existingEntry) {
        const newEntry = {
            id: fullId,
            name: "جاري جلب البيانات...", 
            poster: `https://images.metahub.space/poster/medium/${cleanId}/img`,
            type: args.type,
            time: new Date().toLocaleTimeString('ar-SA')
        };
        history = [newEntry, ...history].slice(0, 15);
        saveData();
    }

    // 2. جلب المعلومات التفصيلية في الخلفية لتحديث السجل
    try {
        let finalName = "";
        let finalPoster = "";

        if (cleanId.startsWith('tt')) {
            const res = await axios.get(`https://v3-cinemeta.strem.io/meta/${args.type}/${cleanId}.json`, { timeout: 4000 });
            if (res.data && res.data.meta) {
                const meta = res.data.meta;
                const parts = fullId.split(':');
                if (args.type === 'series' && parts[1]) {
                    const ep = meta.videos.find(v => v.season == parts[1] && v.number == parts[2]);
                    finalName = ep ? `${meta.name} - ${ep.title}` : meta.name;
                    finalPoster = (ep && ep.thumbnail) ? ep.thumbnail : meta.poster;
                } else {
                    finalName = meta.name;
                    finalPoster = meta.poster;
                }
            }
        } else if (cleanId.startsWith('kitsu')) {
            const kitsuId = cleanId.replace('kitsu:', '');
            const kRes = await axios.get(`https://kitsu.io/api/edge/anime/${kitsuId}`, { timeout: 4000 });
            if (kRes.data && kRes.data.data) {
                const attr = kRes.data.data.attributes;
                const epNum = fullId.split(':')[1];
                finalName = epNum ? `${attr.canonicalTitle} - الحلقة ${epNum}` : attr.canonicalTitle;
                finalPoster = attr.posterImage.medium;
            }
        }

        if (finalName) {
            history = history.map(h => h.id === fullId ? { ...h, name: finalName, poster: finalPoster } : h);
            saveData();
        }
    } catch (e) { console.log("Fetch Metadata Error"); }

    // 3. عرض الترجمات المخزنة في قاعدة البيانات لهذا الـ ID
    const foundSubs = db.filter(s => s.id === fullId).map(s => ({
        id: s.url,
        url: s.url,
        lang: "ara",
        label: s.label
    }));

    return { subtitles: foundSubs };
});

// --- الواجهة الرسومية (HTML/CSS) ---
const style = `
<style>
    :root { --main: #1a1a2e; --accent: #e94560; --bg: #16213e; }
    body { background: var(--bg); color: #fff; font-family: 'Segoe UI', Tahoma, sans-serif; margin: 0; direction: rtl; }
    .nav { background: var(--main); padding: 15px 5%; display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid var(--accent); }
    .container { max-width: 1100px; margin: 2rem auto; padding: 0 20px; display: grid; grid-template-columns: 2fr 1fr; gap: 20px; }
    .card { background: var(--main); border-radius: 12px; padding: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
    .item-row { display: flex; align-items: center; padding: 15px; border-bottom: 1px solid #24344d; }
    .poster { width: 65px; height: 95px; border-radius: 6px; object-fit: cover; margin-left: 15px; }
    .btn { background: var(--accent); color: white; text-decoration: none; padding: 8px 16px; border-radius: 6px; font-weight: bold; border: none; cursor: pointer; display: inline-block; }
    .btn-del { color: #ff4d4d; text-decoration: none; font-size: 0.9rem; margin-right: 10px; }
    input { width: 100%; padding: 10px; background: #0f3460; color: #fff; border: 1px solid #24344d; border-radius: 5px; margin-top: 5px; }
</style>
`;

app.get('/', (req, res) => {
    let rows = history.map(h => `
        <div class="item-row">
            <img src="${h.poster}" class="poster">
            <div style="flex-grow:1">
                <h4 style="margin:0">${h.name}</h4>
                <small style="color:#888;">ID: ${h.id}</small>
            </div>
            <a href="/upload-page/${encodeURIComponent(h.id)}" class="btn">رفع ترجمة</a>
        </div>
    `).join('');

    res.send(`${style}
        <div class="nav"><h2>Abdullah Panel</h2></div>
        <div class="container">
            <div class="card">
                <h3 style="margin-top:0;">📺 آخر الطلبات من ستريميو</h3>
                ${rows || '<p style="color:#666">لم يتم رصد أي طلبات بعد. افتح ستريميو وشغل حلقة...</p>'}
            </div>
            <div class="card">
                <h4>⚙️ الإعدادات</h4>
                <p style="font-size:0.9rem">رابط الإضافة:</p>
                <input readonly value="https://${req.get('host')}/manifest.json">
                <br><br>
                <a href="stremio://${req.get('host')}/manifest.json" class="btn" style="width:100%; text-align:center;">تثبيت الإضافة</a>
                <hr style="border:0; border-top:1px solid #24344d; margin:20px 0;">
                <a href="/admin" style="color:#4ecca3; text-decoration:none;">📁 إدارة المرفوعات (${db.length})</a>
            </div>
        </div>
        <script>setTimeout(()=>location.reload(), 15000);</script>
    `);
});

app.get('/upload-page/:id', (req, res) => {
    res.send(`${style}<div class="card" style="max-width:450px; margin:80px auto;">
        <h3>رفع ملف ترجمة (SRT)</h3>
        <p style="font-size:0.8rem; color:#aaa">للمعرف: ${req.params.id}</p>
        <form action="/upload" method="POST" enctype="multipart/form-data">
            <input type="hidden" name="imdbId" value="${req.params.id}">
            <input type="file" name="subFile" accept=".srt" required style="margin:20px 0;">
            <button type="submit" class="btn" style="width:100%;">تأكيد الرفع ✅</button>
        </form>
    </div>`);
});

app.post('/upload', upload.single('subFile'), (req, res) => {
    if (req.file) {
        db.push({ 
            id: req.body.imdbId, 
            url: `https://${req.get('host')}/download/${req.file.filename}`, 
            label: "ترجمة عبدالله" 
        });
        saveData();
    }
    res.redirect('/');
});

app.get('/admin', (req, res) => {
    let list = db.map((s, i) => `
        <div class="item-row">
            <div style="flex-grow:1"><b>${s.id}</b></div>
            <a href="/delete/${i}" class="btn-del">حذف</a>
        </div>`).join('');
    res.send(`${style}<div class="container"><div class="card" style="grid-column: span 2;">
        <h3>📁 الملفات المرفوعة</h3>
        ${list || '<p>لا توجد ملفات.</p>'}
        <br><a href="/" class="btn">رجوع</a>
    </div></div>`);
});

app.get('/delete/:index', (req, res) => {
    db.splice(req.params.index, 1);
    saveData();
    res.redirect('/admin');
});

// --- مسارات Stremio ---
app.get('/manifest.json', (req, res) => res.json(manifest));
app.get('/subtitles/:type/:id/:extra?.json', (req, res) => {
    // نستخدم المعالج يدوياً لضمان تنفيذ المنطق
    builder.getInterface().get('subtitles', req.params.type, req.params.id).then(r => res.json(r));
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`سيرفر عبدالله جاهز على المنفذ ${port}`));
