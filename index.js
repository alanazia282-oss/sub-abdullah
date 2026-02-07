const express = require('express');
const { addonBuilder } = require('stremio-addon-sdk');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// إعداد المجلدات
const DATA_DIR = path.join(__dirname, 'data');
const SUB_DIR = path.join(__dirname, 'subtitles');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(SUB_DIR)) fs.mkdirSync(SUB_DIR, { recursive: true });

const DB_FILE = path.join(DATA_DIR, 'db.json');
const HISTORY_FILE = path.join(DATA_DIR, 'history.json');

// دالة تحميل البيانات مع ضمان وجود Array
function loadJSON(filePath) {
    try {
        if (fs.existsSync(filePath)) {
            const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            return Array.isArray(data) ? data : [];
        }
    } catch (e) { console.error("Data error, resetting to empty array"); }
    return [];
}

let db = loadJSON(DB_FILE);
let history = loadJSON(HISTORY_FILE);

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

// --- [تصحيح الـ Manifest] ---
const manifest = {
    id: "org.abdullah.fixed.v14",
    version: "14.0.0",
    name: "Community Subtitles",
    description: "تظهر الحلقة هنا فور مشاهدتها في ستريميو",
    resources: ["subtitles"],
    types: ["movie", "series", "anime"],
    idPrefixes: ["tt", "kitsu"],
    catalogs: [] // تأكدنا أنها Array فاضي مو undefined
};

const builder = new addonBuilder(manifest);

// صيد الحلقة
builder.defineSubtitlesHandler(async (args) => {
    const { type, id } = args;
    if (!Array.isArray(history)) history = [];

    let item = history.find(h => h && h.id === id);
    
    if (!item) {
        item = { id, type, name: "جاري الجلب...", poster: "", time: new Date().toLocaleTimeString('ar-SA') };
        history = [item, ...history].slice(0, 30);
        saveData();
        updateEntryMeta(id, type);
    }

    const currentSubs = Array.isArray(db) ? db.filter(s => s && s.id === id).map(s => ({
        id: s.url,
        url: s.url,
        lang: "ara",
        label: s.label
    })) : [];

    return Promise.resolve({ subtitles: currentSubs });
});

async function updateEntryMeta(id, type) {
    const cleanId = id.split(':')[0];
    try {
        let name = id, poster = "";
        if (cleanId.startsWith('tt')) {
            const res = await axios.get(`https://v3-cinemeta.strem.io/meta/${type}/${cleanId}.json`, { timeout: 5000 });
            if (res.data && res.data.meta) {
                name = res.data.meta.name;
                poster = res.data.meta.poster;
                if (type === 'series' && id.includes(':')) {
                    const p = id.split(':');
                    name += ` - S${p[1]} E${p[2]}`;
                }
            }
        }
        history = history.map(h => h.id === id ? { ...h, name, poster } : h);
        saveData();
    } catch (e) {}
}

// واجهة الويب
app.get('/', (req, res) => {
    const cards = history.map(h => `
        <div style="background:#1e293b; border:1px solid #334155; padding:15px; margin-bottom:10px; border-radius:10px; display:flex; align-items:center;">
            <img src="${h.poster || ''}" style="width:50px; height:75px; background:#000; border-radius:5px;">
            <div style="margin-right:15px; flex-grow:1">
                <h4 style="margin:0; color:#fff;">${h.name}</h4>
                <small style="color:#94a3b8;">${h.id}</small>
            </div>
            <a href="/upload/${encodeURIComponent(h.id)}" style="background:#3b82f6; color:#white; padding:10px 20px; text-decoration:none; border-radius:5px; font-weight:bold; color:white;">رفع</a>
        </div>
    `).join('');

    res.send(`
        <body style="background:#0f172a; color:#fff; font-family:sans-serif; direction:rtl; padding:20px;">
            <h2 style="text-align:center;">لوحة التحكم</h2>
            <div style="max-width:700px; margin:auto; background:#1e293b; padding:15px; border-radius:10px; margin-bottom:20px; text-align:center;">
                <p>رابط الإضافة:</p>
                <code>https://${req.get('host')}/manifest.json</code>
            </div>
            <div style="max-width:700px; margin:auto;">${cards || '<p style="text-align:center;">شغل حلقة في ستريميو...</p>'}</div>
        </body>
    `);
});

app.get('/upload/:id', (req, res) => {
    res.send(`
        <body style="background:#0f172a; color:#fff; font-family:sans-serif; direction:rtl; padding:50px; text-align:center;">
            <div style="background:#1e293b; padding:30px; border-radius:15px; display:inline-block;">
                <h3>رفع ترجمة لـ: ${req.params.id}</h3>
                <form action="/do-upload" method="POST" enctype="multipart/form-data">
                    <input type="hidden" name="id" value="${req.params.id}">
                    <input type="file" name="sub" accept=".srt" required><br><br>
                    <input type="text" name="label" placeholder="اسم المترجم" required style="padding:10px; width:100%;"><br><br>
                    <button type="submit" style="background:#10b981; color:#fff; padding:10px; width:100%; border:none; border-radius:5px; cursor:pointer;">نشر</button>
                </form>
                <br><a href="/" style="color:#94a3b8;">إلغاء</a>
            </div>
        </body>
    `);
});

app.post('/do-upload', upload.single('sub'), (req, res) => {
    if (req.file) {
        db.push({ id: req.body.id, url: `https://${req.get('host')}/download/${req.file.filename}`, label: req.body.label });
        saveData();
        res.send('<h1>تم بنجاح!</h1><a href="/">رجوع</a>');
    } else { res.send('فشل الرفع'); }
});

app.get('/manifest.json', (req, res) => res.json(manifest));
app.get('/subtitles/:type/:id/:extra?.json', (req, res) => {
    builder.getInterface().get('subtitles', req.params.type, req.params.id)
        .then(r => res.json(r)).catch(() => res.json({ subtitles: [] }));
});

app.listen(PORT, '0.0.0.0', () => console.log(`Running on ${PORT}`));
