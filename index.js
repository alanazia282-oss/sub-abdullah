const express = require('express');
const { addonBuilder } = require('stremio-addon-sdk');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const app = express();

// إعداد المجلدات والملفات لضمان عدم ضياع البيانات
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
const subDir = path.join(__dirname, 'subtitles');
if (!fs.existsSync(subDir)) fs.mkdirSync(subDir);

const DB_FILE = path.join(DATA_DIR, 'db.json');
const HISTORY_FILE = path.join(DATA_DIR, 'history.json');

// تحميل البيانات من الملفات عند تشغيل السيرفر
let db = fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE)) : [];
let history = fs.existsSync(HISTORY_FILE) ? JSON.parse(fs.readFileSync(HISTORY_FILE)) : [];

const saveData = () => {
    fs.writeFileSync(DB_FILE, JSON.stringify(db));
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(history));
};

const upload = multer({ dest: 'subtitles/' });
app.use(express.json());
app.use('/download', express.static('subtitles'));

const manifest = {
    id: "org.abdullah.pro.system.v1",
    version: "1.0.0",
    name: "Sub Abdullah Ultimate",
    description: "نظام إدارة الترجمة الاحترافي - IMDb & Kitsu",
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
        let poster = `https://images.metahub.space/poster/medium/${cleanId}/img`;

        // 1. محاولة جلب البيانات من IMDb/Cinmeta أولاً
        try {
            const res = await axios.get(`https://v3-cinemeta.strem.io/meta/${args.type}/${cleanId}.json`, { timeout: 3000 });
            if (res.data && res.data.meta) {
                name = res.data.meta.name;
                poster = res.data.meta.poster;
            }
        } catch (e) { console.log("IMDb check skipped or failed"); }

        // 2. إذا كان أنمي أو لم يجد اسماً، نجرب Kitsu
        if (name === "Unknown" || args.type === 'anime') {
            try {
                const kitsuId = cleanId.replace('kitsu:', '');
                const kRes = await axios.get(`https://kitsu.io/api/edge/anime/${kitsuId}`, { timeout: 3000 });
                if (kRes.data && kRes.data.data) {
                    name = kRes.data.data.attributes.canonicalTitle;
                    poster = kRes.data.data.attributes.posterImage.medium;
                }
            } catch (e) { console.log("Kitsu check failed"); }
        }

        const newEntry = {
            id: args.id,
            name: name,
            poster: poster,
            type: args.type,
            season: parts[1] || null,
            episode: parts[2] || null,
            time: new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })
        };

        history = [newEntry, ...history.filter(h => h.id !== args.id)].slice(0, 15);
        saveData();
    } catch (err) { console.log("Global Fetch Error"); }

    return Promise.resolve({ subtitles: db.filter(s => s.id === args.id) });
});

// تصميم الواجهة CSS
const style = `
<style>
    :root { --main: #2c3e50; --accent: #3498db; --bg: #f8f9fa; }
    body { background: var(--bg); font-family: 'Segoe UI', sans-serif; margin: 0; direction: rtl; }
    .nav { background: var(--main); color: white; padding: 1rem 5%; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    .container { max-width: 1200px; margin: 2rem auto; padding: 0 20px; display: grid; grid-template-columns: 2fr 1fr; gap: 25px; }
    .card { background: white; border-radius: 12px; padding: 20px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); border: 1px solid #eee; margin-bottom: 20px; }
    .item-row { display: flex; align-items: center; padding: 15px; border-bottom: 1px solid #f0f0f0; transition: 0.2s; }
    .item-row:hover { background: #fcfcfc; }
    .poster { width: 55px; height: 80px; border-radius: 6px; object-fit: cover; margin-left: 15px; background: #ddd; }
    .info { flex-grow: 1; }
    .info h4 { margin: 0 0 5px; color: var(--main); font-size: 1.1rem; }
    .badge { font-size: 0.7rem; padding: 3px 8px; border-radius: 4px; background: #e9ecef; color: #495057; font-weight: bold; }
    .btn { background: var(--accent); color: white; text-decoration: none; padding: 8px 16px; border-radius: 6px; font-weight: bold; transition: 0.3s; display: inline-block; border: none; cursor: pointer; }
    .btn:hover { opacity: 0.9; transform: translateY(-1px); }
    .sidebar-link { display: block; padding: 12px; color: var(--main); text-decoration: none; border-bottom: 1px solid #eee; font-weight: 500; }
    .sidebar-link:hover { background: #f8f9fa; color: var(--accent); }
</style>
`;

app.get('/', (req, res) => {
    let rows = history.map(h => `
        <div class="item-row">
            <img src="${h.poster}" class="poster">
            <div class="info">
                <h4>${h.name}</h4>
                <span class="badge">${h.type === 'series' ? 'مسلسل' : 'فيلم'}</span>
                <span class="badge" style="background:#d4edda; color:#155724;">${h.season ? `S${h.season} E${h.episode}` : 'IMDb'}</span>
            </div>
            <a href="/upload-page/${h.id}" class="btn">رفع ترجمة</a>
        </div>
    `).join('');

    res.send(`${style}
        <div class="nav"><h2>Abdullah Subtitles</h2> <span>لوحة الإدارة</span></div>
        <div class="container">
            <div class="card">
                <h3 style="margin-top:0; border-bottom:2px solid var(--accent); display:inline-block;">النشاط الأخير</h3>
                ${rows || '<p style="text-align:center; padding:40px; color:#888;">شغل أي شيء في ستريميو ليظهر هنا..</p>'}
            </div>
            <div>
                <div class="card">
                    <h4 style="margin:0 0 10px;">الحالة</h4>
                    <p style="font-size:0.9rem; color:#666;">رابط الإضافة الخاص بك:</p>
                    <input type="text" value="https://${req.get('host')}/manifest.json" style="width:100%; padding:8px; border:1px solid #ddd; border-radius:4px; font-size:0.8rem;" readonly>
                    <a href="stremio://${req.get('host')}/manifest.json" class="btn" style="width:100%; margin-top:15px; text-align:center; background:#28a745;">تثبيت في ستريميو</a>
                </div>
                <div class="card" style="padding:0;">
                    <a href="/admin" class="sidebar-link">📂 المرفوعات (${db.length})</a>
                    <a href="/" class="sidebar-link">🔄 تحديث السجل</a>
                </div>
            </div>
        </div>
        <script>setTimeout(() => { location.reload(); }, 30000);</script>
    `);
});

app.get('/admin', (req, res) => {
    let list = db.map((item, i) => `<div class="item-row"><div class="info"><h4>ملف لـ ${item.id}</h4></div><a href="/delete/${i}" style="color:red; text-decoration:none;">حذف 🗑️</a></div>`).join('');
    res.send(`${style}<div class="container"><div class="card"><h3>الملفات المرفوعة</h3>${list || 'لا يوجد ملفات'}<br><a href="/" class="btn">رجوع</a></div></div>`);
});

app.get('/upload-page/:id', (req, res) => {
    const item = history.find(h => h.id === req.params.id);
    if (!item) return res.redirect('/');
    res.send(`${style}<div style="max-width:450px; margin:60px auto;" class="card">
        <h3 style="text-align:center;">رفع ترجمة لـ ${item.name}</h3>
        <form action="/upload" method="POST" enctype="multipart/form-data">
            <input type="hidden" name="imdbId" value="${item.id}">
            <input type="file" name="subFile" accept=".srt" required style="display:block; margin:20px auto;">
            <button type="submit" class="btn" style="width:100%;">تأكيد الرفع ✅</button>
        </form>
    </div>`);
});

app.post('/upload', upload.single('subFile'), (req, res) => {
    const subUrl = `https://${req.get('host')}/download/${req.file.filename}`;
    db.push({ id: req.body.imdbId, lang: "ara", url: subUrl, label: "ترجمة عبدالله" });
    saveData();
    res.redirect('/');
});

app.get('/delete/:index', (req, res) => {
    db.splice(req.params.index, 1);
    saveData();
    res.redirect('/admin');
});

app.get('/manifest.json', (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.json(manifest);
});

app.get('/subtitles/:type/:id/:extra?.json', (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    builder.getInterface().get('subtitles', req.params.type, req.params.id).then(r => res.json(r));
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log("Server Running on Port " + port));
