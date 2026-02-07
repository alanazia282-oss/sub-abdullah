const express = require('express');
const { addonBuilder } = require('stremio-addon-sdk');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cors = require('cors');

const app = express();

// --- [1] إعدادات البيانات ---
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

const upload = multer({ dest: 'subtitles/' });
app.use(cors());
app.use(express.json());
app.use('/download', express.static('subtitles'));

// --- [2] Stremio Manifest ---
const manifest = {
    id: "org.abdullah.fix.v14",
    version: "14.0.0",
    name: "Abdullah Pro Fix",
    description: "نظام جلب الصور والعناوين المطور",
    resources: ["subtitles"],
    types: ["movie", "series", "anime"],
    idPrefixes: ["tt", "kitsu"],
    catalogs: [] 
};

const builder = new addonBuilder(manifest);

// --- [3] المحرك المطور (إصلاح الصور والعناوين) ---
builder.defineSubtitlesHandler(async (args) => {
    const fullId = args.id;
    const cleanId = fullId.split(':')[0];
    const parts = fullId.split(':');
    
    // محاولة بناء صورة افتراضية ذكية فوراً قبل الجلب
    let initialPoster = `https://images.metahub.space/poster/medium/${cleanId}/img`;
    if (args.type === 'series' && parts[2]) {
        // إذا كان مسلسل، نحاول جلب صورة الحلقة مباشرة من ميتأهب
        initialPoster = `https://images.metahub.space/background/medium/${cleanId}/img`;
    }

    let existingEntry = history.find(h => h.id === fullId);
    if (!existingEntry) {
        const newEntry = {
            id: fullId,
            name: "جاري البحث عن التفاصيل...", 
            poster: initialPoster,
            type: args.type,
            time: new Date().toLocaleTimeString('ar-SA')
        };
        history = [newEntry, ...history].slice(0, 15);
        saveData();
    }

    // تشغيل الجلب العميق للعنوان وصورة الحلقة
    fetchDeepMeta(args.type, fullId, cleanId);

    const foundSubs = db.filter(s => s.id === fullId).map(s => ({
        id: s.url, url: s.url, lang: "ara", label: s.label || "ترجمة عبدالله"
    }));

    return { subtitles: foundSubs };
});

async function fetchDeepMeta(type, fullId, cleanId) {
    try {
        let finalName = "";
        let finalPoster = "";
        const parts = fullId.split(':');
        const s = parts[1], e = parts[2];

        // 1. جلب البيانات من Cinemeta
        const res = await axios.get(`https://v3-cinemeta.strem.io/meta/${type}/${cleanId}.json`, { timeout: 6000 });
        if (res.data && res.data.meta) {
            const meta = res.data.meta;
            if (type === 'series' && s && e) {
                const ep = meta.videos?.find(v => v.season == s && v.number == e);
                finalName = `${meta.name} - S${s}E${e} ${ep && ep.title ? '- ' + ep.title : ''}`;
                finalPoster = (ep && ep.thumbnail) ? ep.thumbnail : (meta.poster || meta.background);
            } else {
                finalName = meta.name;
                finalPoster = meta.poster;
            }
        }

        // 2. إذا كان أنمي، نحدث من Kitsu لزيادة الدقة
        if (cleanId.startsWith('kitsu') && e) {
            const kitsuId = cleanId.split(':')[1];
            const kRes = await axios.get(`https://kitsu.io/api/edge/anime/${kitsuId}/episodes?filter[number]=${e}`);
            if (kRes.data && kRes.data.data[0]) {
                const epAttr = kRes.data.data[0].attributes;
                if (epAttr.canonicalTitle) finalName += ` (${epAttr.canonicalTitle})`;
                if (epAttr.thumbnail) finalPoster = epAttr.thumbnail.original;
            }
        }

        if (finalName) {
            history = history.map(h => h.id === fullId ? { ...h, name: finalName, poster: finalPoster } : h);
            saveData();
        }
    } catch (err) { console.log("Meta Error for " + fullId); }
}

// --- [4] واجهة المستخدم ---
const CSS = `<style>
    body { background: #0b0f19; color: #e5e7eb; font-family: sans-serif; direction: rtl; margin: 0; }
    .nav { background: #111827; padding: 20px; text-align: center; border-bottom: 2px solid #3b82f6; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 20px; padding: 20px; }
    .card { background: #1f2937; border-radius: 12px; overflow: hidden; display: flex; border: 1px solid #374151; }
    .card img { width: 110px; height: 160px; object-fit: cover; }
    .card-body { padding: 15px; display: flex; flex-direction: column; justify-content: space-between; flex: 1; }
    .btn { background: #3b82f6; color: white; padding: 8px; border-radius: 6px; text-decoration: none; text-align: center; font-weight: bold; }
    .sidebar { background: #111827; padding: 20px; margin: 20px; border-radius: 12px; }
    input { width: 100%; padding: 10px; margin-top: 10px; background: #0b0f19; border: 1px solid #374151; color: white; }
</style>`;

app.get('/', (req, res) => {
    let cards = history.map(h => `
        <div class="card">
            <img src="${h.poster}" onerror="this.src='https://via.placeholder.com/110x160?text=No+Image'">
            <div class="card-body">
                <div>
                    <div style="color:#3b82f6; font-weight:bold; margin-bottom:5px;">${h.name}</div>
                    <small style="color:#9ca3af;">ID: ${h.id}</small>
                </div>
                <a href="/upload-page/${encodeURIComponent(h.id)}" class="btn">رفع ترجمة</a>
            </div>
        </div>
    `).join('');

    res.send(`${CSS}
        <div class="nav"><h1>لوحة تحكم عبدالله Pro</h1></div>
        <div class="sidebar">
            <h3>🔗 رابط الإضافة:</h3>
            <input readonly value="https://${req.get('host')}/manifest.json">
        </div>
        <div class="grid">${cards || '<p>بانتظار تشغيل مادة في ستريميو...</p>'}</div>
        <script>setTimeout(()=>location.reload(), 5000);</script>
    `);
});

// صفحة الرفع
app.get('/upload-page/:id', (req, res) => {
    res.send(`${CSS}
        <div style="max-width:400px; margin: 100px auto; background:#1f2937; padding:30px; border-radius:12px;">
            <h3>رفع ملف ترجمة</h3>
            <form action="/upload" method="POST" enctype="multipart/form-data">
                <input type="hidden" name="id" value="${req.params.id}">
                <input type="file" name="sub" accept=".srt" required>
                <input type="text" name="label" placeholder="اسم المترجم (اختياري)">
                <button type="submit" class="btn" style="width:100%; margin-top:15px; border:none; cursor:pointer;">تأكيد الرفع</button>
            </form>
        </div>
    `);
});

app.post('/upload', upload.single('sub'), (req, res) => {
    if (req.file) {
        db.push({ id: req.body.id, url: `https://${req.get('host')}/download/${req.file.filename}`, label: req.body.label || "ترجمة عبدالله" });
        saveData();
    }
    res.redirect('/');
});

app.get('/manifest.json', (req, res) => res.json(manifest));
app.get('/subtitles/:type/:id/:extra?.json', (req, res) => {
    builder.getInterface().get('subtitles', req.params.type, req.params.id).then(r => res.json(r));
});

app.listen(process.env.PORT || 3000, () => console.log("Server Started"));
