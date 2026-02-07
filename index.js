const express = require('express');
const { addonBuilder } = require('stremio-addon-sdk');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cors = require('cors');

const app = express();

// --- 1. إعدادات البنية التحتية ---
const DATA_DIR = path.join(__dirname, 'data');
const SUB_DIR = path.join(__dirname, 'subtitles');
[DATA_DIR, SUB_DIR].forEach(dir => { if (!fs.existsSync(dir)) fs.mkdirSync(dir); });

const DB_FILE = path.join(DATA_DIR, 'db.json');
const HISTORY_FILE = path.join(DATA_DIR, 'history.json');

let db = fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE)) : [];
let history = fs.existsSync(HISTORY_FILE) ? JSON.parse(fs.readFileSync(HISTORY_FILE)) : [];

const saveData = () => {
    fs.writeFileSync(DB_FILE, JSON.stringify(db), 'utf8');
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(history), 'utf8');
};

const upload = multer({ dest: 'subtitles/' });
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/download', express.static('subtitles'));

// --- 2. Stremio Manifest ---
const manifest = {
    id: "org.abdullah.ultimate.system",
    version: "2.0.0",
    name: "Abdullah Pro System V2",
    description: "النظام المتكامل لإدارة الترجمات - تحكم كامل، بحث، ورفع",
    resources: ["subtitles"],
    types: ["movie", "series", "anime"],
    idPrefixes: ["tt", "kitsu"],
    catalogs: []
};

const builder = new addonBuilder(manifest);

// --- 3. محرك البحث وجلب البيانات ---
async function getMetaData(id, type) {
    const parts = id.split(':');
    const cleanId = parts[0];
    let data = { id, name: "محتوى غير معروف", poster: `https://images.metahub.space/poster/medium/${cleanId}/img`, label: "" };

    try {
        if (cleanId.startsWith('tt')) {
            const res = await axios.get(`https://v3-cinemeta.strem.io/meta/${type}/${cleanId}.json`);
            const meta = res.data.meta;
            if (meta) {
                data.name = meta.name;
                data.poster = meta.poster;
                if (type === 'series' && parts[1]) {
                    data.label = `S${parts[1]} | E${parts[2]}`;
                    const ep = meta.videos?.find(v => v.season == parts[1] && v.number == parts[2]);
                    if (ep?.thumbnail) data.poster = ep.thumbnail;
                }
            }
        } else if (cleanId.startsWith('kitsu')) {
            const kId = cleanId.split(':')[1];
            const res = await axios.get(`https://kitsu.io/api/edge/anime/${kId}`);
            const attr = res.data.data.attributes;
            data.name = attr.canonicalTitle;
            data.poster = attr.posterImage.medium;
            if (parts[1]) data.label = `EP ${parts[1]}`;
        }
    } catch (e) { console.log("Meta Fetch Error"); }
    return data;
}

// --- 4. معالج ستريميو ---
builder.defineSubtitlesHandler(async (args) => {
    if (!history.find(h => h.id === args.id)) {
        const meta = await getMetaData(args.id, args.type);
        history = [{ ...meta, type: args.type, date: new Date().toLocaleString('ar-SA') }, ...history].slice(0, 30);
        saveData();
    }
    const subtitles = db.filter(s => s.id === args.id).map(s => ({
        id: s.url, url: s.url, lang: "ara", label: s.label
    }));
    return { subtitles };
});

// --- 5. واجهة التحكم الاحترافية (HTML) ---
const getLayout = (content) => `
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Abdullah Control Panel</title>
    <style>
        :root { --primary: #3b82f6; --bg: #0f172a; --card: #1e293b; --accent: #10b981; }
        body { background: var(--bg); color: #f1f5f9; font-family: system-ui; margin: 0; padding-bottom: 50px; }
        .navbar { background: #1e293b; padding: 15px 5%; display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid var(--primary); sticky; top:0; z-index:100; }
        .container { max-width: 1200px; margin: 20px auto; padding: 0 15px; }
        .stats-bar { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 25px; }
        .stat-card { background: var(--card); padding: 15px; border-radius: 12px; border-right: 4px solid var(--primary); }
        .main-grid { display: grid; grid-template-columns: 2fr 1fr; gap: 25px; }
        .card { background: var(--card); border-radius: 15px; padding: 20px; box-shadow: 0 4px 15px rgba(0,0,0,0.3); }
        .item-row { display: flex; align-items: center; background: #2d3748; margin-bottom: 12px; padding: 12px; border-radius: 12px; transition: 0.2s; }
        .item-row:hover { background: #334155; }
        .poster { width: 70px; height: 100px; border-radius: 8px; object-fit: cover; margin-left: 15px; }
        .btn { background: var(--primary); color: white; padding: 8px 18px; border-radius: 8px; text-decoration: none; border: none; cursor: pointer; font-weight: bold; }
        .btn-green { background: var(--accent); }
        .btn-red { background: #ef4444; }
        input, select { background: #0f172a; color: white; border: 1px solid #334155; padding: 10px; border-radius: 8px; width: 100%; box-sizing: border-box; }
        @media (max-width: 850px) { .main-grid { grid-template-columns: 1fr; } }
    </style>
</head>
<body>
    <div class="navbar">
        <h2 style="margin:0">لوحة تحكم عبدالله 🚀</h2>
        <div style="display:flex; gap:10px;">
            <a href="/" class="btn">الرئيسية</a>
            <a href="/admin" class="btn btn-green">الملفات المرفوعة</a>
        </div>
    </div>
    <div class="container">${content}</div>
</body>
</html>`;

// --- المسار الرئيسي ---
app.get('/', (req, res) => {
    let historyRows = history.map(h => `
        <div class="item-row">
            <img src="${h.poster}" class="poster">
            <div style="flex-grow:1">
                <h4 style="margin:0">${h.name}</h4>
                <span style="color:#94a3b8; font-size:0.8rem;">${h.label || h.type}</span><br>
                <code style="font-size:0.7rem; color:var(--primary)">${h.id}</code>
            </div>
            <a href="/upload-page/${encodeURIComponent(h.id)}" class="btn">رفع ترجمة</a>
        </div>
    `).join('');

    const content = `
        <div class="stats-bar">
            <div class="stat-card"><b>إجمالي الترجمات:</b> ${db.length}</div>
            <div class="stat-card"><b>آخر الطلبات:</b> ${history.length}</div>
            <div class="stat-card"><b>حالة السيرفر:</b> <span style="color:var(--accent)">متصل ✅</span></div>
        </div>
        <div class="main-grid">
            <div class="card">
                <h3>📺 السجل المباشر (ستريميو)</h3>
                ${historyRows || '<p style="text-align:center; color:#64748b;">لا يوجد نشاط حالي...</p>'}
            </div>
            <div class="card">
                <h3>🔍 إضافة يدوية (بواسطة ID)</h3>
                <form action="/manual-add" method="POST">
                    <input type="text" name="id" placeholder="مثال: tt1234567" required><br><br>
                    <select name="type">
                        <option value="movie">فيلم (Movie)</option>
                        <option value="series">مسلسل (Series)</option>
                    </select><br><br>
                    <button class="btn btn-green" style="width:100%">إضافة للسجل</button>
                </form>
                <hr style="margin:20px 0; border:1px solid #334155;">
                <h3>📥 تثبيت الإضافة</h3>
                <input readonly value="https://${req.get('host')}/manifest.json">
                <br><br>
                <a href="stremio://${req.get('host')}/manifest.json" class="btn" style="display:block; text-align:center;">Install to Stremio</a>
            </div>
        </div>
    `;
    res.send(getLayout(content));
});

// --- رفع الترجمة مع اختيار التسمية ---
app.get('/upload-page/:id', (req, res) => {
    const item = history.find(h => h.id === req.params.id);
    const content = `
        <div class="card" style="max-width:600px; margin: auto;">
            <h2>تجهيز الرفع لـ: ${item ? item.name : 'محتوى غير معروف'}</h2>
            <form action="/upload" method="POST" enctype="multipart/form-data">
                <input type="hidden" name="imdbId" value="${req.params.id}">
                <label>تسمية الترجمة (تظهر في ستريميو):</label>
                <input type="text" name="label" value="ترجمة عبدالله | العربية" required style="margin:10px 0 20px 0;">
                
                <label>اختر ملف SRT:</label>
                <div style="padding:30px; border:2px dashed var(--primary); border-radius:10px; text-align:center; margin:10px 0;">
                    <input type="file" name="subFile" accept=".srt" required>
                </div>
                <button type="submit" class="btn btn-green" style="width:100%; padding:15px;">حفظ ونشر الترجمة 🚀</button>
            </form>
        </div>
    `;
    res.send(getLayout(content));
});

app.post('/upload', upload.single('subFile'), (req, res) => {
    if (req.file) {
        db.push({ 
            id: req.body.imdbId, 
            url: `https://${req.get('host')}/download/${req.file.filename}`, 
            label: req.body.label 
        });
        saveData();
    }
    res.redirect('/');
});

app.post('/manual-add', async (req, res) => {
    const meta = await getMetaData(req.body.id, req.body.type);
    history = [{ ...meta, type: req.body.type, date: "إضافة يدوية" }, ...history];
    saveData();
    res.redirect('/');
});

app.get('/admin', (req, res) => {
    let list = db.map((s, i) => `
        <div class="item-row">
            <div style="flex-grow:1"><b>${s.id}</b><br><small style="color:var(--accent)">${s.label}</small></div>
            <a href="/delete/${i}" class="btn btn-red">حذف الملف</a>
        </div>`).join('');
    res.send(getLayout(`<h2>📁 إدارة الترجمات المرفوعة</h2><div class="card">${list || 'لا توجد ملفات.'}</div>`));
});

app.get('/delete/:index', (req, res) => {
    const item = db[req.params.index];
    if(item) {
        const filePath = path.join(SUB_DIR, path.basename(item.url));
        if(fs.existsSync(filePath)) fs.unlinkSync(filePath);
        db.splice(req.params.index, 1);
        saveData();
    }
    res.redirect('/admin');
});

// --- Stremio Routes ---
app.get('/manifest.json', (req, res) => res.json(manifest));
app.get('/subtitles/:type/:id/:extra?.json', (req, res) => {
    const subtitles = db.filter(s => s.id === req.params.id).map(s => ({
        id: s.url, url: s.url, lang: "ara", label: s.label
    }));
    res.json({ subtitles });
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Super Server on ${port}`));
