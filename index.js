const express = require('express');
const { addonBuilder } = require('stremio-addon-sdk');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cors = require('cors');

const app = express();

// --- [1] إعدادات المجلدات والبيانات (بدون حذف أي وظيفة) ---
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

// --- [2] إعدادات السيرفر والرفع ---
const upload = multer({ dest: 'subtitles/' });
app.use(cors());
app.use(express.json());
app.use('/download', express.static('subtitles'));

// --- [3] Stremio Manifest ---
const manifest = {
    id: "org.abdullah.ultimate.v12",
    version: "12.0.0",
    name: "Community Subtitles",
    description: "Official Subtitle Manager",
    resources: ["subtitles"],
    types: ["movie", "series", "anime"],
    idPrefixes: ["tt", "kitsu"],
    catalogs: [] 
};
const builder = new addonBuilder(manifest);

// --- [4] محرك جلب البيانات الذكي (كامل مع Kitsu و Cinemeta) ---
async function fetchMeta(type, fullId) {
    const cleanId = fullId.split(':')[0];
    try {
        if (cleanId.startsWith('tt')) {
            const res = await axios.get(`https://v3-cinemeta.strem.io/meta/${type}/${cleanId}.json`, { timeout: 5000 });
            if (res.data?.meta) {
                const meta = res.data.meta;
                const parts = fullId.split(':');
                if (type === 'series' && parts[1]) {
                    const ep = meta.videos?.find(v => v.season == parts[1] && v.number == parts[2]);
                    return { 
                        name: ep ? `${meta.name} - S${parts[1]}E${parts[2]}` : meta.name, 
                        poster: (ep && ep.thumbnail) ? ep.thumbnail : meta.poster 
                    };
                }
                return { name: meta.name, poster: meta.poster };
            }
        } else if (cleanId.startsWith('kitsu')) {
            const kitsuId = cleanId.split(':')[1];
            const res = await axios.get(`https://kitsu.io/api/edge/anime/${kitsuId}`, { timeout: 5000 });
            if (res.data?.data) {
                const attr = res.data.data.attributes;
                return { name: attr.canonicalTitle, poster: attr.posterImage.medium };
            }
        }
    } catch (e) { console.error("Metadata Fetch Error"); }
    return { name: fullId, poster: "https://via.placeholder.com/300x450?text=No+Poster" };
}

// --- [5] واجهة المستخدم (التصميم المطلوب) ---
const style = `
<style>
    :root { --blue-sub: #5bc0de; --dark-navy: #111827; }
    body { background: #f3f4f6; font-family: 'Segoe UI', sans-serif; margin: 0; }
    .nav { background: var(--dark-navy); color: white; padding: 15px 50px; display: flex; justify-content: space-between; align-items: center; }
    .nav a { color: #9ca3af; text-decoration: none; font-size: 14px; margin-left: 20px; }
    .container { max-width: 1200px; margin: 30px auto; display: grid; grid-template-columns: 320px 1fr; gap: 25px; padding: 0 20px; }
    .card { background: white; border-radius: 4px; border: 1px solid #e5e7eb; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .blue-head { background: #2563eb; color: white; padding: 12px; font-weight: bold; font-size: 14px; }
    
    .menu-item { background: white; border: 1px solid #e5e7eb; border-radius: 4px; margin-bottom: 12px; }
    .menu-header { background: #f9fafb; padding: 15px; cursor: pointer; display: flex; justify-content: space-between; font-weight: bold; border-bottom: 1px solid #eee; }
    .menu-content { padding: 15px; display: none; }
    .menu-content.active { display: block; }

    .btn-main { background: #5cb85c; color: white; border: none; padding: 10px 15px; border-radius: 4px; cursor: pointer; width: 100%; font-weight: bold; }
    .history-card { display: flex; gap: 12px; padding: 10px; border-bottom: 1px solid #f3f4f6; text-decoration: none; color: inherit; transition: 0.2s; }
    .history-card:hover { background: #f0f7ff; }
    .history-card img { width: 50px; height: 75px; object-fit: cover; border-radius: 4px; }
    .sub-item { background: var(--blue-sub); color: white; padding: 15px; border-radius: 4px; margin-bottom: 10px; }
</style>
`;

// --- [6] المسارات (Routes) ---

// الصفحة الرئيسية
app.get('/', (req, res) => {
    const historyHtml = history.map(h => `
        <a href="/content/${encodeURIComponent(h.id)}" class="history-card">
            <img src="${h.poster}">
            <div>
                <div style="font-weight:bold; font-size:14px;">${h.name}</div>
                <div style="font-size:11px; color:#6b7280;">ID: ${h.id}</div>
            </div>
        </a>`).join('');

    res.send(`<html><head><title>Dashboard</title>${style}</head><body>
        <div class="nav"><b>CC Community Subtitles</b> <div><a href="/">Dashboard</a><a href="/admin">Admin</a></div></div>
        <div class="container">
            <div class="sidebar">
                <div class="card"><div class="blue-head">Addon Link</div>
                    <div style="padding:15px;"><input readonly value="stremio://${req.get('host')}/manifest.json" style="width:100%; font-size:10px; padding:5px;"></div>
                </div>
            </div>
            <div class="main">
                <div class="menu-item">
                    <div class="menu-header" onclick="toggle(this)"><span>+ Upload Subtitles (Add Work)</span><span>▼</span></div>
                    <div class="menu-content active">
                        <form action="/add-work" method="POST">
                            <p style="font-size:12px; color:#666;">Enter IMDb ID (tt...) or Kitsu ID:</p>
                            <input name="id" placeholder="e.g. tt1234567:1:1" required style="width:100%; padding:10px; margin-bottom:10px; border:1px solid #ddd;">
                            <select name="type" style="width:100%; padding:10px; margin-bottom:10px;">
                                <option value="movie">Movie</option><option value="series">Series</option><option value="anime">Anime</option>
                            </select>
                            <button class="btn-main">Find & Start Uploading</button>
                        </form>
                    </div>
                </div>

                <div class="menu-item">
                    <div class="menu-header" onclick="toggle(this)"><span>Selected Subtitles (History)</span><span>▼</span></div>
                    <div class="menu-content active">${historyHtml || '<p style="font-size:12px; color:#999;">No works selected yet.</p>'}</div>
                </div>
            </div>
        </div>
        <script>function toggle(el){ el.nextElementSibling.classList.toggle('active'); }</script>
    </body></html>`);
});

// إضافة عمل للهيستوري
app.post('/add-work', async (req, res) => {
    const { id, type } = req.body;
    const meta = await fetchMeta(type, id);
    if (!history.find(h => h.id === id)) {
        history.unshift({ id, type, ...meta, time: new Date().toLocaleTimeString() });
        saveData();
    }
    res.redirect(`/content/${encodeURIComponent(id)}`);
});

// صفحة تفاصيل العمل
app.get('/content/:id', (req, res) => {
    const item = history.find(h => h.id === req.params.id) || { id: req.params.id, name: "Loading...", poster: "" };
    const subs = db.filter(s => s.id === req.params.id);

    res.send(`<html><head>${style}</head><body>
        <div class="nav"><b>Content Manager</b> <a href="/">Back to Dashboard</a></div>
        <div class="container">
            <div class="sidebar"><div class="card"><img src="${item.poster}" style="width:100%"><div class="blue-head">Metadata</div><div style="padding:10px; font-size:11px;">ID: ${item.id}</div></div></div>
            <div class="main">
                <div style="background:var(--dark-navy); color:white; padding:20px; border-radius:4px; margin-bottom:20px;"><h2>${item.name}</h2></div>
                <div class="menu-item">
                    <div class="menu-header"><span>Upload SRT File</span></div>
                    <div class="menu-content active">
                        <form action="/upload" method="POST" enctype="multipart/form-data">
                            <input type="hidden" name="imdbId" value="${item.id}">
                            <input type="file" name="subFile" accept=".srt" required style="margin-bottom:10px;"><br>
                            <input name="label" placeholder="Your Name or Version" style="width:100%; padding:10px; margin-bottom:10px; border:1px solid #ddd;">
                            <button class="btn-main" style="background:#2563eb;">Publish Now</button>
                        </form>
                    </div>
                </div>
                <div class="menu-item">
                    <div class="menu-header"><span>Active Subtitles</span></div>
                    <div class="menu-content active">
                        ${subs.map(s => `<div class="sub-item"><b>${s.label}</b><br><small>${s.url}</small></div>`).join('') || 'No subtitles yet.'}
                    </div>
                </div>
            </div>
        </div>
    </body></html>`);
});

// رفع الملف
app.post('/upload', upload.single('subFile'), (req, res) => {
    if (req.file) {
        db.push({ id: req.body.imdbId, url: `https://${req.get('host')}/download/${req.file.filename}`, label: req.body.label || "Community Sub", filename: req.file.filename });
        saveData();
    }
    res.redirect('/content/' + encodeURIComponent(req.body.imdbId));
});

// الإدارة
app.get('/admin', (req, res) => {
    let list = db.map((s, i) => `<div class="history-card"><div style="flex:1;"><b>${s.label}</b> - ${s.id}</div><a href="/delete/${i}" style="color:red;">Delete</a></div>`).join('');
    res.send(`<html><head>${style}</head><body><div class="container" style="grid-template-columns:1fr;"><div class="card"><div class="blue-head" style="background:red;">Admin Panel</div><div style="padding:20px;">${list || 'No data'}</div></div></div></body></html>`);
});

app.get('/delete/:index', (req, res) => {
    const item = db[req.params.index];
    if (item && item.filename) { try { fs.unlinkSync(path.join(SUB_DIR, item.filename)); } catch(e){} }
    db.splice(req.params.index, 1);
    saveData();
    res.redirect('/admin');
});

// الاستجابة لـ Stremio
builder.defineSubtitlesHandler(async (args) => {
    const found = db.filter(s => s.id === args.id).map(s => ({ id: s.url, url: s.url, lang: "ara", label: s.label }));
    return { subtitles: found };
});

app.get('/manifest.json', (req, res) => res.json(manifest));
app.get('/subtitles/:type/:id/:extra?.json', (req, res) => {
    builder.getInterface().get('subtitles', req.params.type, req.params.id).then(r => res.json(r)).catch(() => res.json({ subtitles: [] }));
});

app.listen(3000, () => console.log('All systems go on port 3000'));
