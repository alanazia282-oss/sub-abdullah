const express = require('express');
const { addonBuilder } = require('stremio-addon-sdk');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// إعداد المسارات
const DATA_DIR = path.join(__dirname, 'data');
const SUB_DIR = path.join(__dirname, 'subtitles');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(SUB_DIR)) fs.mkdirSync(SUB_DIR, { recursive: true });

const DB_FILE = path.join(DATA_DIR, 'db.json');
const HISTORY_FILE = path.join(DATA_DIR, 'history.json');

let db = JSON.parse(fs.existsSync(DB_FILE) ? fs.readFileSync(DB_FILE, 'utf8') : '[]');
let history = JSON.parse(fs.existsSync(HISTORY_FILE) ? fs.readFileSync(HISTORY_FILE, 'utf8') : '[]');

const saveData = () => {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
        fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
    } catch (e) { console.error("Save error:", e); }
};

const upload = multer({ dest: 'subtitles/' });
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/download', express.static('subtitles'));

const manifest = {
    id: "org.abdullah.ultimate",
    version: "1.0.0",
    name: "Community Subtitles",
    description: "تظهر الحلقة هنا فور مشاهدتها في ستريميو",
    resources: ["subtitles"],
    types: ["movie", "series", "anime"],
    idPrefixes: ["tt", "kitsu"]
};

const builder = new addonBuilder(manifest);

// --- المحرك: صيد الحلقة بمجرد التشغيل ---
builder.defineSubtitlesHandler(async (args) => {
    const { type, id } = args;
    let item = history.find(h => h.id === id);
    
    if (!item) {
        item = { id, type, name: "جاري الجلب...", poster: "", time: new Date().toLocaleTimeString('ar-SA') };
        history = [item, ...history].slice(0, 30);
        saveData();
        updateEntryMeta(id, type);
    }

    const subs = db.filter(s => s.id === id).map(s => ({
        id: s.url,
        url: s.url,
        lang: "ara",
        label: s.label
    }));

    return { subtitles: subs };
});

async function updateEntryMeta(id, type) {
    const cleanId = id.split(':')[0];
    try {
        let name = id, poster = "";
        if (cleanId.startsWith('tt')) {
            const res = await axios.get(`https://v3-cinemeta.strem.io/meta/${type}/${cleanId}.json`);
            if (res.data.meta) {
                name = res.data.meta.name;
                poster = res.data.meta.poster;
                if (type === 'series') {
                    const p = id.split(':');
                    name += ` - S${p[1]} E${p[2]}`;
                }
            }
        }
        history = history.map(h => h.id === id ? { ...h, name, poster } : h);
        saveData();
    } catch (e) {}
}

// --- تصميم الـ Dashboard الفخم ---
const CSS = `
<style>
    :root { --bg: #0f172a; --card: #1e293b; --text: #f8fafc; --accent: #3b82f6; }
    body { background: var(--bg); color: var(--text); font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; direction: rtl; }
    .nav { background: #1e293b; padding: 1rem 5%; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 4px 6px -1px #000; }
    .container { max-width: 1000px; margin: 2rem auto; padding: 0 20px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 20px; }
    .card { background: var(--card); border-radius: 12px; overflow: hidden; transition: 0.3s; border: 1px solid #334155; position: relative; }
    .card:hover { transform: translateY(-5px); border-color: var(--accent); }
    .card img { width: 100%; height: 180px; object-fit: cover; opacity: 0.6; }
    .card-body { padding: 15px; }
    .btn { background: var(--accent); color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; text-decoration: none; display: inline-block; font-size: 14px; }
    .badge { background: #334155; padding: 2px 8px; border-radius: 4px; font-size: 11px; color: #94a3b8; }
</style>`;

app.get('/', (req, res) => {
    const cards = history.map(h => `
        <div class="card">
            <img src="${h.poster || 'https://via.placeholder.com/400x200?text=No+Poster'}">
            <div class="card-body">
                <div class="badge">${h.type}</div>
                <h3 style="margin:10px 0; font-size:16px;">${h.name}</h3>
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <span style="font-size:12px; color:#94a3b8;">${h.time}</span>
                    <a href="/upload/${encodeURIComponent(h.id)}" class="btn">رفع ترجمة</a>
                </div>
            </div>
        </div>
    `).join('');

    res.send(`
        <html><head><title>Community Subs</title>${CSS}</head>
        <body>
            <div class="nav"><h2>لوحة التحكم</h2> <span>الإصدار 12.0</span></div>
            <div class="container">
                <div style="background:var(--accent); padding:20px; border-radius:12px; margin-bottom:30px;">
                    <h3>رابط الإضافة:</h3>
                    <code style="background:#000; padding:10px; display:block; border-radius:6px; word-break:break-all;">https://${req.get('host')}/manifest.json</code>
                </div>
                <div class="grid">${cards || '<p>شغل شي في ستريميو الحين وبيطلع هنا...</p>'}</div>
            </div>
        </body></html>
    `);
});

app.get('/upload/:id', (req, res) => {
    res.send(`
        <html><head>${CSS}</head><body>
        <div class="container" style="max-width:500px; margin-top:100px;">
            <div class="card" style="padding:30px;">
                <h3>رفع ملف لـ: ${req.params.id}</h3>
                <form action="/do-upload" method="POST" enctype="multipart/form-data">
                    <input type="hidden" name="id" value="${req.params.id}">
                    <p>ملف الترجمة (SRT):</p>
                    <input type="file" name="sub" accept=".srt" required style="margin-bottom:20px;">
                    <p>اسم المترجم / اللغة:</p>
                    <input type="text" name="label" placeholder="مثلاً: ترجمة عبدالله" required style="width:100%; padding:10px; background:#0f172a; border:1px solid #334155; color:white; border-radius:6px; margin-bottom:20px;">
                    <button type="submit" class="btn" style="width:100%">نشر الآن</button>
                </form>
                <br><a href="/" style="color:#94a3b8; text-decoration:none;">إلغاء</a>
            </div>
        </div></body></html>
    `);
});

app.post('/do-upload', upload.single('sub'), (req, res) => {
    if (req.file) {
        db.push({ id: req.body.id, url: `https://${req.get('host')}/download/${req.file.filename}`, label: req.body.label });
        saveData();
        res.send('<h1>تم النشر بنجاح!</h1><a href="/">ارجع للرئيسية</a>');
    } else { res.status(400).send('وين الملف؟'); }
});

app.get('/manifest.json', (req, res) => res.json(manifest));
app.get('/subtitles/:type/:id/:extra?.json', (req, res) => {
    builder.getInterface().get('subtitles', req.params.type, req.params.id)
        .then(r => res.json(r)).catch(() => res.json({ subtitles: [] }));
});

app.listen(PORT, '0.0.0.0', () => console.log(`Active on port ${PORT}`));
