const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cors = require('cors');

// ==========================================
// [1] التكوين الأساسي وإدارة الملفات
// ==========================================
const DATA_DIR = path.join(__dirname, 'data');
const SUB_DIR = path.join(__dirname, 'subtitles');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(SUB_DIR)) fs.mkdirSync(SUB_DIR, { recursive: true });

const DB_FILE = path.join(DATA_DIR, 'db.json');
const HISTORY_FILE = path.join(DATA_DIR, 'history.json');

let db = fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE)) : [];
let history = fs.existsSync(HISTORY_FILE) ? JSON.parse(fs.readFileSync(HISTORY_FILE)) : [];

const saveData = () => {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
        fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
    } catch (e) { console.error("Error saving data:", e); }
};

// ==========================================
// [2] تعريف الـ Manifest (The Heart of Addon)
// ==========================================
const manifest = {
    id: "com.ultimate.sub.manager.v1",
    version: "1.5.0",
    name: "Sub Manager Pro",
    description: "نظام متكامل لرفع وإدارة الترجمات الشخصية وحفظ سجل المشاهدة",
    logo: "https://cdn-icons-png.flaticon.com/512/3658/3658959.png",
    background: "https://images.alphacoders.com/605/605339.jpg",
    resources: [
        "subtitles",
        "catalog",
        "meta"
    ],
    types: ["movie", "series", "anime"],
    idPrefixes: ["tt", "kitsu"],
    // المصفوفة اللي تهمك: الكتالوجات
    catalogs: [
        {
            type: "movie",
            id: "my_custom_subs",
            name: "My Subtitled Library",
            extra: [{ name: "search", isRequired: false }]
        },
        {
            type: "series",
            id: "recent_history",
            name: "Recently Played on Stremio",
            extra: [{ name: "search", isRequired: false }]
        }
    ]
};

const builder = new addonBuilder(manifest);

// ==========================================
// [3] معالجات ستريميو (Handlers)
// ==========================================

// 1. معالج الكتالوج (Catalog Handler)
builder.defineCatalogHandler(async (args) => {
    console.log(`[Catalog] Request for: ${args.id}`);
    let metas = [];

    if (args.id === "my_custom_subs") {
        // تجميع الأفلام الفريدة اللي لها ترجمات في القاعدة
        const uniqueIds = [...new Set(db.map(s => s.id))];
        metas = uniqueIds.map(id => ({
            id: id.split(':')[0],
            type: "movie",
            name: db.find(s => s.id === id).label,
            poster: `https://images.metahub.space/poster/medium/${id.split(':')[0]}/img`
        }));
    } else if (args.id === "recent_history") {
        metas = history.map(h => ({
            id: h.id.split(':')[0],
            type: h.type,
            name: h.name,
            poster: h.poster
        }));
    }

    if (args.extra.search) {
        metas = metas.filter(m => m.name.toLowerCase().includes(args.extra.search.toLowerCase()));
    }

    return { metas };
});

// 2. معالج البيانات الوصفية (Meta Handler)
builder.defineMetaHandler(async (args) => {
    const cleanId = args.id.split(':')[0];
    try {
        const res = await axios.get(`https://v3-cinemeta.strem.io/meta/${args.type}/${cleanId}.json`);
        return { meta: res.data.meta };
    } catch (e) {
        return { meta: null };
    }
});

// 3. معالج الترجمات (Subtitles Handler)
builder.defineSubtitlesHandler(async (args) => {
    const fullId = args.id;
    const cleanId = fullId.split(':')[0];

    // تحديث الهستوري تلقائياً
    if (!history.find(h => h.id === fullId)) {
        const entry = {
            id: fullId,
            name: "Fetching...",
            poster: `https://images.metahub.space/poster/medium/${cleanId}/img`,
            type: args.type,
            time: new Date().toLocaleString()
        };
        history = [entry, ...history].slice(0, 50);
        saveData();
        // جلب الاسم الحقيقي في الخلفية لتسريع الاستجابة
        fetchRealName(fullId, args.type, cleanId);
    }

    const found = db.filter(s => s.id === fullId).map(s => ({
        url: s.url,
        lang: "ara",
        label: s.label
    }));

    return { subtitles: found };
});

async function fetchRealName(fullId, type, cleanId) {
    try {
        const res = await axios.get(`https://v3-cinemeta.strem.io/meta/${type}/${cleanId}.json`);
        if (res.data.meta) {
            history = history.map(h => h.id === fullId ? { ...h, name: res.data.meta.name, poster: res.data.meta.poster } : h);
            saveData();
        }
    } catch (e) {}
}

// ==========================================
// [4] واجهة المستخدم (The Dashboard)
// ==========================================
const app = express();
app.use(cors());
app.use(express.json());
const upload = multer({ dest: 'subtitles/' });
app.use('/sub-files', express.static(SUB_DIR));

const CSS = `
<style>
    body { font-family: 'Segoe UI', sans-serif; background: #0f172a; color: white; margin: 0; }
    .nav { background: #1e293b; padding: 1rem 5%; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #334155; }
    .container { padding: 2rem 5%; display: grid; grid-template-columns: 300px 1fr; gap: 2rem; }
    .sidebar { background: #1e293b; padding: 1.5rem; border-radius: 12px; height: fit-content; }
    .card { background: #1e293b; border-radius: 12px; padding: 1.5rem; margin-bottom: 1.5rem; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 1.5rem; }
    .movie-card { background: #0f172a; border-radius: 8px; overflow: hidden; border: 1px solid #334155; transition: 0.3s; }
    .movie-card:hover { transform: scale(1.05); }
    .movie-card img { width: 100%; height: 280px; object-fit: cover; }
    .movie-card div { padding: 10px; font-size: 0.9rem; text-align: center; }
    .btn { background: #3b82f6; color: white; border: none; padding: 8px 15px; border-radius: 5px; cursor: pointer; text-decoration: none; display: block; margin-top: 10px; text-align: center; }
    input, select { width: 100%; padding: 10px; margin: 10px 0; border-radius: 5px; border: 1px solid #334155; background: #0f172a; color: white; }
</style>`;

app.get('/', (req, res) => {
    const historyHtml = history.map(h => `
        <div class="movie-card">
            <img src="${h.poster}">
            <div>
                <strong>${h.name}</strong><br>
                <small>${h.time}</small>
                <a href="/upload/${encodeURIComponent(h.id)}" class="btn">Add Subtitle</a>
            </div>
        </div>`).join('');

    res.send(`<html><head>${CSS}</head><body>
        <div class="nav"><h2>SUB-PRO MANAGER</h2> <span>Status: Online</span></div>
        <div class="container">
            <div class="sidebar">
                <h3>System Info</h3>
                <p>Database: ${db.length} Subs</p>
                <p>History: ${history.length} Items</p>
                <hr>
                <h3>Install Addon</h3>
                <input value="http://${req.get('host')}/manifest.json" readonly onclick="this.select()">
            </div>
            <div>
                <h3>Recent Activity (Play in Stremio to Update)</h3>
                <div class="grid">${historyHtml || 'No activity detected.'}</div>
            </div>
        </div>
        <script>setTimeout(()=>location.reload(), 10000)</script>
    </body></html>`);
});

app.get('/upload/:id', (req, res) => {
    res.send(`<html><head>${CSS}</head><body>
        <div style="max-width:500px; margin: 50px auto;" class="card">
            <h2>Upload Subtitle for ${req.params.id}</h2>
            <form action="/do-upload" method="POST" enctype="multipart/form-data">
                <input type="hidden" name="id" value="${req.params.id}">
                <label>Select SRT File:</label>
                <input type="file" name="sub" required>
                <label>Label (e.g. Arabic 1080p):</label>
                <input type="text" name="label" required>
                <button type="submit" class="btn" style="width:100%">Upload & Publish</button>
            </form>
            <a href="/" style="color: #94a3b8; display:block; margin-top:20px; text-align:center;">Back to Dashboard</a>
        </div>
    </body></html>`);
});

app.post('/do-upload', upload.single('sub'), (req, res) => {
    if (req.file) {
        const url = `${req.protocol}://${req.get('host')}/sub-files/${req.file.filename}`;
        db.push({ id: req.body.id, url, label: req.body.label });
        saveData();
    }
    res.redirect('/');
});

// ==========================================
// [5] تشغيل السيرفر المدمج
// ==========================================
const addonInterface = builder.getInterface();
serveHTTP(addonInterface, { app, port: 3000 });

console.log("Addon active at: http://localhost:3000/manifest.json");
