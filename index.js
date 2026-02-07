const express = require('express');
const { addonBuilder } = require('stremio-addon-sdk');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cors = require('cors');

const app = express();

// --- إعداد المسارات والمجلدات وقاعدة البيانات ---
const DATA_DIR = path.join(__dirname, 'data');
const SUB_DIR = path.join(__dirname, 'subtitles');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(SUB_DIR)) fs.mkdirSync(SUB_DIR, { recursive: true });

const DB_FILE = path.join(DATA_DIR, 'db.json');
const HISTORY_FILE = path.join(DATA_DIR, 'history.json');

let db = fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE)) : [];
let history = fs.existsSync(HISTORY_FILE) ? JSON.parse(fs.readFileSync(HISTORY_FILE)) : [];

const saveData = () => {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
};

// --- إعدادات الميدل وير والرفع ---
const upload = multer({ dest: 'subtitles/' });
app.use(cors());
app.use(express.json());
app.use('/download', express.static('subtitles'));

// --- مانيفست الإضافة (Stremio Manifest) ---
const manifest = {
    id: "org.abdullah.imdb.kitsu.v9",
    version: "9.0.0",
    name: "Abdullah Premium System",
    description: "نظام عبدالله المطور: جلب البيانات من IMDb و Cinemeta لضمان ظهور الصور فوراً",
    resources: ["subtitles"],
    types: ["movie", "series", "anime"],
    idPrefixes: ["tt", "kitsu"],
    catalogs: []
};

const builder = new addonBuilder(manifest);

// --- محرك البحث العالمي (اعتماد IMDb/Cinemeta للسرعة) ---
async function getFullMeta(type, fullId) {
    const parts = fullId.split(':');
    const mainId = parts[0]; // IMDb ID like tt12345 or kitsu:123
    const season = parts[1];
    const episode = parts[2];

    let metaData = {
        id: fullId,
        name: "جاري التحميل من IMDb...",
        poster: `https://images.metahub.space/poster/medium/${mainId}/img`,
        info: (episode) ? `موسم ${season} - حلقة ${episode}` : "فيلم",
        timestamp: Date.now()
    };

    try {
        // إذا كان المعرف يبدأ بـ tt (وهو الغالب في الأفلام والمسلسلات والأنمي المدعوم بـ IMDb)
        if (mainId.startsWith('tt')) {
            const cinemetaUrl = `https://v3-cinemeta.strem.io/meta/${type}/${mainId}.json`;
            const response = await axios.get(cinemetaUrl, { timeout: 5000 });

            if (response.data && response.data.meta) {
                const meta = response.data.meta;
                metaData.name = meta.name;
                metaData.poster = meta.poster;

                // إذا كان مسلسل، نبحث عن صورة الحلقة المحددة
                if (type === 'series' || type === 'anime') {
                    const video = meta.videos?.find(v => v.season == season && v.number == episode);
                    if (video) {
                        if (video.title) metaData.name += ` - ${video.title}`;
                        if (video.thumbnail) metaData.poster = video.thumbnail;
                    }
                }
            }
        } 
        // إذا كان المعرف Kitsu حصراً، نستخدم محرك Kitsu
        else if (mainId.startsWith('kitsu')) {
            const kId = mainId.replace('kitsu:', '');
            const kRes = await axios.get(`https://kitsu.io/api/edge/anime/${kId}`, { timeout: 5000 });
            if (kRes.data && kRes.data.data) {
                const attr = kRes.data.data.attributes;
                metaData.name = attr.canonicalTitle;
                metaData.poster = attr.posterImage.large;
            }
        }
    } catch (err) {
        console.error("Meta fetch error:", err.message);
    }
    return metaData;
}

// --- معالج الترجمة ---
builder.defineSubtitlesHandler(async (args) => {
    getFullMeta(args.type, args.id).then(meta => {
        history = [meta, ...history.filter(h => h.id !== args.id)].slice(0, 50);
        saveData();
    });

    const matchedSubs = db.filter(s => s.id === args.id).map(s => ({
        id: s.url,
        url: s.url,
        lang: "ara",
        label: s.label || "ترجمة عبدالله"
    }));

    return { subtitles: matchedSubs };
});

// --- واجهة مستخدم فخمة (CSS موسع) ---
const THEME = `
<style>
    @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;900&display=swap');
    :root { --primary: #f5c518; --bg: #000000; --card: #1a1a1a; --text: #ffffff; }
    body { background: var(--bg); color: var(--text); font-family: 'Cairo', sans-serif; direction: rtl; margin: 0; }
    .nav { background: var(--card); padding: 20px 5%; border-bottom: 3px solid var(--primary); display: flex; justify-content: space-between; align-items: center; }
    .nav h1 { color: var(--primary); margin: 0; font-weight: 900; letter-spacing: 1px; }
    .container { max-width: 1300px; margin: 40px auto; padding: 0 20px; display: grid; grid-template-columns: 2fr 1fr; gap: 30px; }
    .card-main { background: var(--card); border-radius: 15px; padding: 25px; border: 1px solid #333; }
    .video-item { display: flex; background: #222; border-radius: 12px; margin-bottom: 20px; border-right: 5px solid var(--primary); overflow: hidden; transition: 0.3s; }
    .video-item:hover { transform: translateX(-10px); background: #2a2a2a; }
    .video-item img { width: 180px; height: 260px; object-fit: cover; }
    .video-details { padding: 25px; flex-grow: 1; position: relative; }
    .video-title { font-size: 24px; font-weight: bold; margin-bottom: 10px; color: var(--primary); }
    .video-meta { background: #333; padding: 5px 12px; border-radius: 5px; font-size: 14px; }
    .btn { background: var(--primary); color: #000; padding: 12px 25px; border-radius: 8px; text-decoration: none; font-weight: bold; display: inline-block; border: none; cursor: pointer; margin-top: 20px; }
    .btn:hover { background: #e2b616; }
    .sidebar { position: sticky; top: 20px; }
    input { width: 100%; padding: 15px; margin: 10px 0; border-radius: 8px; border: 1px solid #444; background: #000; color: #fff; font-size: 16px; }
    @media (max-width: 900px) { .container { grid-template-columns: 1fr; } .video-item { flex-direction: column; } .video-item img { width: 100%; height: 250px; } }
</style>
`;

const layout = (body) => `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Abdullah IMDb Pro</title>
    ${THEME}
</head>
<body>
    <div class="nav">
        <h1>ABDULLAH <span style="color:#fff">SYSTEM</span></h1>
        <div style="display:flex; gap:20px;">
            <a href="/" style="color:#fff; text-decoration:none;">الرئيسية</a>
            <a href="/admin" style="color:var(--primary); text-decoration:none;">لوحة الإدارة</a>
        </div>
    </div>
    <div class="container">${body}</div>
</body>
</html>
`;

// --- المسارات (Routes) ---

app.get('/', (req, res) => {
    let historyRows = history.map(h => `
        <div class="video-item">
            <img src="${h.poster}" onerror="this.src='https://via.placeholder.com/180x260?text=No+Poster'">
            <div class="video-details">
                <div class="video-title">${h.name}</div>
                <span class="video-meta">${h.info}</span><br><br>
                <a href="/upload-page/${encodeURIComponent(h.id)}" class="btn">إضافة ترجمة 📁</a>
            </div>
        </div>
    `).join('');

    res.send(layout(`
        <div class="card-main">
            <h2 style="margin-top:0;">📡 آخر النشاطات المكتشفة</h2>
            ${historyRows || '<p style="color:#666; text-align:center; padding:40px;">افتح أي فيلم أو أنمي في ستريميو ليظهر هنا...</p>'}
        </div>
        <div class="sidebar">
            <div class="card-main">
                <h3 style="color:var(--primary); margin-top:0;">⚙️ معلومات الإضافة</h3>
                <p>رابط الإضافة الخاص بك:</p>
                <input type="text" value="https://${req.get('host')}/manifest.json" readonly>
                <a href="stremio://${req.get('host')}/manifest.json" class="btn" style="width:100%; text-align:center; box-sizing:border-box;">تثبيت في STREMIO</a>
                <p style="font-size:12px; color:#888; margin-top:15px;">* هذا النظام يستخدم Cinemeta لضمان استقرار الصور والأسماء.</p>
            </div>
        </div>
        <script>setTimeout(()=> { if(window.location.pathname === '/') window.location.reload(); }, 8000);</script>
    `));
});

app.get('/upload-page/:id', (req, res) => {
    const item = history.find(h => h.id === req.params.id);
    res.send(layout(`
        <div class="card-main" style="grid-column: span 2; max-width:600px; margin:auto;">
            <h2>رفع ترجمة جديدة</h2>
            <p>العمل: <span style="color:var(--primary)">${item ? item.name : 'محتوى جديد'}</span></p>
            <form action="/upload" method="POST" enctype="multipart/form-data">
                <input type="hidden" name="imdbId" value="${req.params.id}">
                <p>ملف الترجمة (SRT):</p>
                <input type="file" name="subFile" accept=".srt" required>
                <p>اسم المترجم:</p>
                <input type="text" name="label" placeholder="مثال: عبدالله القحطاني">
                <button type="submit" class="btn" style="width:100%">حفظ ونشر الترجمة</button>
            </form>
        </div>
    `));
});

app.post('/upload', upload.single('subFile'), (req, res) => {
    if (req.file) {
        db.push({ id: req.body.imdbId, url: `https://${req.get('host')}/download/${req.file.filename}`, label: req.body.label || "ترجمة عبدالله", filename: req.file.filename });
        saveData();
    }
    res.redirect('/');
});

app.get('/admin', (req, res) => {
    let rows = db.map((s, i) => `
        <div class="video-item" style="padding:15px; border-right-color:#ef4444;">
            <div style="flex-grow:1">
                <div style="font-weight:bold;">${s.label}</div>
                <div style="font-size:12px; color:#888;">ID: ${s.id}</div>
            </div>
            <a href="/delete/${i}" class="btn" style="background:#ef4444; color:#fff; margin-top:0;">حذف</a>
        </div>
    `).join('');
    res.send(layout(`<div class="card-main" style="grid-column: span 2;"><h2>📂 إدارة الترجمات المرفوعة</h2>${rows || 'لا توجد ملفات حالياً'}<br><a href="/" class="btn">العودة</a></div>`));
});

app.get('/delete/:index', (req, res) => {
    const sub = db[req.params.index];
    if (sub) {
        try { fs.unlinkSync(path.join(SUB_DIR, sub.filename)); } catch(e){}
        db.splice(req.params.index, 1);
        saveData();
    }
    res.redirect('/admin');
});

// --- تشغيل السيرفر ---
app.get('/manifest.json', (req, res) => res.json(manifest));
app.get('/subtitles/:type/:id/:extra?.json', async (req, res) => {
    const r = await builder.getInterface().get('subtitles', req.params.type, req.params.id);
    res.json(r);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`[System Ready] Running on port ${PORT}`));
