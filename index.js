const express = require('express');
const { addonBuilder } = require('stremio-addon-sdk');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cors = require('cors');

const app = express();

// --- [1] إعدادات البيئة وتخزين البيانات ---
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
    } catch (err) {
        console.error("Error saving data:", err);
    }
};

// --- [2] إعداد المانيفست (The Manifest) ---
const manifest = {
    id: "org.abdullah.full.system.v15",
    version: "15.0.0",
    name: "Ultimate Subtitle Manager",
    description: "Full Dashboard to control, upload, and manage subtitles for Stremio.",
    logo: "https://cdn-icons-png.flaticon.com/512/3658/3658959.png",
    resources: [
        "subtitles",
        "catalog",
        {
            name: "meta",
            types: ["movie", "series", "anime"],
            idPrefixes: ["tt", "kitsu"]
        }
    ],
    types: ["movie", "series", "anime"],
    idPrefixes: ["tt", "kitsu"],
    catalogs: [
        {
            type: "movie",
            id: "my_uploaded_subs",
            name: "My Subtitled Library",
            extra: [
                { name: "search", isRequired: false },
                { name: "skip", isRequired: false }
            ]
        },
        {
            type: "series",
            id: "history_catalog",
            name: "Recent Stremio Activity"
        }
    ]
};

const builder = new addonBuilder(manifest);

// --- [3] معالج الكتالوج (Catalog Handler) ---
builder.defineCatalogHandler(async (args) => {
    console.log("Catalog requested:", args.id);
    let metas = [];

    if (args.id === "my_uploaded_subs") {
        // عرض الأفلام التي تم رفع ترجمة لها
        metas = db.map(item => ({
            id: item.id.split(':')[0],
            type: "movie",
            name: item.label,
            poster: `https://images.metahub.space/poster/medium/${item.id.split(':')[0]}/img`
        }));
    } else if (args.id === "history_catalog") {
        // عرض سجل المشاهدة الأخير
        metas = history.map(h => ({
            id: h.id.split(':')[0],
            type: h.type,
            name: h.name,
            poster: h.poster
        }));
    }

    // دعم البحث البسيط داخل الكتالوج
    if (args.extra.search) {
        metas = metas.filter(m => m.name.toLowerCase().includes(args.extra.search.toLowerCase()));
    }

    return { metas: metas };
});

// --- [4] معالج البيانات الوصفية (Meta Handler) ---
builder.defineMetaHandler(async (args) => {
    const cleanId = args.id.split(':')[0];
    try {
        const res = await axios.get(`https://v3-cinemeta.strem.io/meta/${args.type}/${cleanId}.json`);
        return { meta: res.data.meta };
    } catch (e) {
        return { meta: null };
    }
});

// --- [5] معالج الترجمات (Subtitles Handler) ---
builder.defineSubtitlesHandler(async (args) => {
    const fullId = args.id;
    const cleanId = fullId.split(':')[0];

    // تحديث الهستوري فوراً عند طلب الترجمة
    if (!history.find(h => h.id === fullId)) {
        const newEntry = {
            id: fullId,
            name: "Fetching Title...",
            poster: `https://images.metahub.space/poster/medium/${cleanId}/img`,
            type: args.type,
            time: new Date().toLocaleString('en-GB')
        };
        history = [newEntry, ...history].slice(0, 30);
        saveData();
        
        // جلب الاسم الحقيقي في الخلفية
        updateEntryMeta(fullId, args.type, cleanId);
    }

    const foundSubs = db.filter(s => s.id === fullId).map(s => ({
        url: s.url,
        lang: "ara",
        label: s.label || "Uploaded Sub"
    }));

    return { subtitles: foundSubs };
});

async function updateEntryMeta(fullId, type, cleanId) {
    try {
        const res = await axios.get(`https://v3-cinemeta.strem.io/meta/${type}/${cleanId}.json`);
        if (res.data.meta) {
            history = history.map(h => h.id === fullId ? { ...h, name: res.data.meta.name, poster: res.data.meta.poster } : h);
            saveData();
        }
    } catch (e) {}
}

// --- [6] واجهة المستخدم والسيرفر (Dashboard) ---
app.use(cors());
app.use(express.json());
const upload = multer({ dest: 'subtitles/' });
app.use('/download', express.static('subtitles'));

const DASHBOARD_HTML = `
<style>
    :root { --primary: #2563eb; --dark: #0f172a; --bg: #f8fafc; }
    body { font-family: 'Inter', sans-serif; background: var(--bg); margin: 0; display: flex; flex-direction: column; height: 100vh; }
    .nav { background: var(--dark); color: white; padding: 1rem 3rem; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 2px 10px rgba(0,0,0,0.2); }
    .main-grid { display: grid; grid-template-columns: 280px 1fr; gap: 2rem; padding: 2rem; flex: 1; max-width: 1600px; margin: 0 auto; width: 100%; box-sizing: border-box; }
    .sidebar { background: white; border-radius: 12px; border: 1px solid #e2e8f0; height: fit-content; position: sticky; top: 2rem; }
    .sidebar-item { display: flex; justify-content: space-between; padding: 1rem; text-decoration: none; color: #475569; border-bottom: 1px solid #f1f5f9; transition: 0.2s; }
    .sidebar-item:hover { background: #f1f5f9; color: var(--primary); }
    .card { background: white; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; }
    .card-header { padding: 1.25rem; background: #fff; border-bottom: 1px solid #e2e8f0; font-weight: 700; color: var(--dark); }
    .history-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(350px, 1fr)); gap: 1rem; padding: 1.25rem; }
    .h-item { display: flex; background: #fff; border: 1px solid #f1f5f9; border-radius: 10px; padding: 0.75rem; transition: 0.3s; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
    .h-item:hover { transform: translateY(-3px); box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1); }
    .h-item img { width: 70px; height: 100px; border-radius: 6px; object-fit: cover; }
    .h-info { margin-left: 1rem; flex: 1; }
    .h-info h4 { margin: 0 0 0.5rem 0; font-size: 1rem; color: var(--dark); }
    .btn { background: var(--primary); color: white; padding: 0.5rem 1rem; border-radius: 6px; text-decoration: none; font-size: 0.85rem; display: inline-block; }
    .badge { background: var(--dark); color: white; padding: 0.2rem 0.6rem; border-radius: 20px; font-size: 0.75rem; }
</style>
`;

app.get('/', (req, res) => {
    const historyCards = history.map(h => `
        <div class="h-item">
            <img src="${h.poster}">
            <div class="h-info">
                <span class="badge" style="background:#f59e0b; color:black; font-weight:bold;">${h.type.toUpperCase()}</span>
                <h4>${h.name}</h4>
                <div style="margin-bottom:10px; font-size:0.8rem; color:#64748b;">ID: ${h.id}</div>
                <a href="/upload-page/${encodeURIComponent(h.id)}" class="btn">Add Subtitle</a>
            </div>
            <div style="font-size:0.75rem; color:#94a3b8;">${h.time.split(',')[1] || h.time}</div>
        </div>
    `).join('');

    res.send(`
        <html><head><title>Subtitle Dashboard</title>${DASHBOARD_HTML}</head>
        <body>
            <div class="nav">
                <div style="font-size:1.5rem; font-weight:900; letter-spacing:-1px;">SUB HUB PRO</div>
                <div style="display:flex; gap:20px;"><a href="/" style="color:white; text-decoration:none;">Dashboard</a><a href="/admin" style="color:white; text-decoration:none;">Admin</a></div>
            </div>
            <div class="main-grid">
                <div class="sidebar">
                    <div style="padding:1.25rem; font-weight:800; border-bottom:1px solid #e2e8f0; color:var(--primary);">CONTROL CENTER</div>
                    <a href="/admin" class="sidebar-item"><span>Uploaded Files</span> <span class="badge">${db.length}</span></a>
                    <a href="/" class="sidebar-item"><span>Active Sessions</span> <span class="badge">${history.length}</span></a>
                    <div style="padding:1.25rem;">
                         <small style="color:#94a3b8;">Addon URL:</small>
                         <input style="width:100%; margin-top:5px; padding:5px; font-size:10px;" value="http://${req.get('host')}/manifest.json" readonly>
                    </div>
                </div>
                <div class="content">
                    <div class="card">
                        <div class="card-header">STREMIO REAL-TIME ACTIVITY</div>
                        <div class="history-list">${historyCards || '<p style="padding:20px;">No activity detected yet. Start a movie in Stremio!</p>'}</div>
                    </div>
                </div>
            </div>
            <script>setTimeout(() => { location.reload(); }, 6000);</script>
        </body></html>
    `);
});

// --- [7] مسارات الرفع والإدارة (Detailed Routes) ---
app.get('/upload-page/:id', (req, res) => {
    res.send(`<div style="padding:5rem; font-family:sans-serif; background:#f8fafc; height:100vh;">
        <div style="max-width:500px; margin:0 auto; background:white; padding:2rem; border-radius:12px; border:1px solid #e2e8f0;">
            <h2 style="margin-top:0;">Upload Subtitle</h2>
            <p style="color:#64748b;">Target: <b>${req.params.id}</b></p><hr>
            <form action="/upload" method="POST" enctype="multipart/form-data">
                <input type="hidden" name="imdbId" value="${req.params.id}">
                <div style="margin-bottom:1.5rem;">
                    <label style="display:block; margin-bottom:0.5rem;">Select .SRT File</label>
                    <input type="file" name="subFile" accept=".srt" required>
                </div>
                <div style="margin-bottom:1.5rem;">
                    <label style="display:block; margin-bottom:0.5rem;">Subtitle Label</label>
                    <input type="text" name="label" placeholder="e.g. Arabic HDRip" required style="width:100%; padding:0.75rem; border:1px solid #e2e8f0; border-radius:6px;">
                </div>
                <button type="submit" style="width:100%; padding:0.75rem; background:#2563eb; color:white; border:none; border-radius:6px; font-weight:700; cursor:pointer;">Publish Subtitle</button>
            </form>
            <br><a href="/" style="color:#64748b; text-decoration:none;">← Cancel and Go Back</a>
        </div>
    </div>`);
});

app.post('/upload', upload.single('subFile'), (req, res) => {
    if (req.file) {
        db.push({
            id: req.body.imdbId,
            url: `http://${req.get('host')}/download/${req.file.filename}`,
            label: req.body.label,
            filename: req.file.filename,
            date: new Date().toISOString()
        });
        saveData();
    }
    res.redirect('/');
});

app.get('/admin', (req, res) => {
    const rows = db.map((s, i) => `
        <div style="padding:1rem; border-bottom:1px solid #eee; display:flex; justify-content:space-between;">
            <div><b>${s.label}</b><br><small>${s.id}</small></div>
            <a href="/delete/${i}" style="color:red; font-weight:bold;">Delete</a>
        </div>`).join('');
    res.send(`<div style="padding:3rem; font-family:sans-serif;">
        <div class="card" style="max-width:800px; margin:0 auto;">
            <div class="card-header">MANAGE UPLOADS</div>
            ${rows || '<p style="padding:2rem;">No uploads found.</p>'}
            <div style="padding:1rem;"><a href="/">← Dashboard</a></div>
        </div>
    </div>`);
});

app.get('/delete/:index', (req, res) => {
    const item = db[req.params.index];
    if (item && item.filename) {
        try { fs.unlinkSync(path.join(SUB_DIR, item.filename)); } catch(e) {}
    }
    db.splice(req.params.index, 1);
    saveData();
    res.redirect('/admin');
});

// --- [8] ربط روابط ستريميو بالـ SDK Builder ---
app.get('/manifest.json', (req, res) => res.json(manifest));

app.get('/catalog/:type/:id/:extra?.json', (req, res) => {
    const extra = req.params.extra ? Object.fromEntries(new URLSearchParams(req.params.extra)) : {};
    builder.getInterface().get('catalog', req.params.type, req.params.id, { extra }).then(r => res.json(r));
});

app.get('/meta/:type/:id.json', (req, res) => {
    builder.getInterface().get('meta', req.params.type, req.params.id).then(r => res.json(r));
});

app.get('/subtitles/:type/:id/:extra?.json', (req, res) => {
    builder.getInterface().get('subtitles', req.params.type, req.params.id).then(r => res.json(r));
});

// تشغيل السيرفر
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`
    =============================================
    🚀 SYSTEM RUNNING ON PORT ${PORT}
    📡 MANIFEST: http://localhost:${PORT}/manifest.json
    🖥️ DASHBOARD: http://localhost:${PORT}/
    =============================================
    `);
});
