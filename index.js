const express = require('express');
const { addonBuilder } = require('stremio-addon-sdk');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cors = require('cors');

const app = express();

// --- [1] إعدادات البيئة (بدون لمس أي مسار) ---
const DATA_DIR = path.join(__dirname, 'data');
const SUB_DIR = path.join(__dirname, 'subtitles');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(SUB_DIR)) fs.mkdirSync(SUB_DIR, { recursive: true });

const DB_FILE = path.join(DATA_DIR, 'db.json');
const HISTORY_FILE = path.join(DATA_DIR, 'history.json');

let db = [];
let history = [];

try {
    if (fs.existsSync(DB_FILE)) db = JSON.parse(fs.readFileSync(DB_FILE));
    if (fs.existsSync(HISTORY_FILE)) history = JSON.parse(fs.readFileSync(HISTORY_FILE));
} catch (e) {
    console.error("Error loading databases:", e);
}

const saveData = () => {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
        fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
    } catch (e) {
        console.error("Error saving data:", e);
    }
};

// --- [2] الإعدادات التقنية للسيرفر ---
const upload = multer({ 
    dest: 'subtitles/',
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/download', express.static('subtitles'));

// --- [3] Stremio Manifest ---
const manifest = {
    id: "org.abdullah.ultimate.v12",
    version: "12.0.0",
    name: "Community Subtitles",
    description: "The most advanced subtitle manager for the community.",
    resources: ["subtitles"],
    types: ["movie", "series", "anime"],
    idPrefixes: ["tt", "kitsu"],
    catalogs: []
};
const builder = new addonBuilder(manifest);

// --- [4] محرك جلب البيانات العميق (Cinemeta + Kitsu) ---
async function getDetailedMeta(type, fullId) {
    const cleanId = fullId.split(':')[0];
    const parts = fullId.split(':');
    
    try {
        if (cleanId.startsWith('tt')) {
            const res = await axios.get(`https://v3-cinemeta.strem.io/meta/${type}/${cleanId}.json`, { timeout: 8000 });
            if (res.data && res.data.meta) {
                const meta = res.data.meta;
                let title = meta.name;
                let poster = meta.poster;

                if (type === 'series' && parts[1]) {
                    const episode = meta.videos?.find(v => v.season == parts[1] && v.number == parts[2]);
                    if (episode) {
                        title = `${meta.name} - S${parts[1]}E${parts[2]} (${episode.title})`;
                        poster = episode.thumbnail || meta.poster;
                    }
                }
                return { name: title, poster: poster, year: meta.year || "" };
            }
        } else if (cleanId.startsWith('kitsu')) {
            const kitsuId = cleanId.split(':')[1];
            const res = await axios.get(`https://kitsu.io/api/edge/anime/${kitsuId}`, { timeout: 8000 });
            if (res.data && res.data.data) {
                const attr = res.data.data.attributes;
                let title = attr.canonicalTitle;
                if (parts[1]) title += ` - Episode ${parts[1]}`;
                return { name: title, poster: attr.posterImage.medium, year: attr.startDate };
            }
        }
    } catch (e) { console.error("Meta fetch failed for:", fullId); }
    return { name: fullId, poster: "https://via.placeholder.com/300x450?text=No+Data", year: "" };
}

// --- [5] واجهة المستخدم الاحترافية ---
const fullStyle = `
<style>
    :root { --main-blue: #2563eb; --bg: #f3f4f6; --dark: #111827; }
    body { background: var(--bg); font-family: 'Inter', system-ui, sans-serif; margin: 0; direction: ltr; }
    .nav { background: var(--dark); color: white; padding: 1rem 5%; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    .nav b { font-size: 1.2rem; letter-spacing: 1px; }
    .nav-links a { color: #9ca3af; text-decoration: none; margin-left: 20px; font-size: 0.9rem; transition: 0.3s; }
    .nav-links a:hover { color: white; }
    
    .container { max-width: 1200px; margin: 40px auto; display: grid; grid-template-columns: 320px 1fr; gap: 30px; padding: 0 20px; }
    
    .card { background: white; border-radius: 8px; border: 1px solid #e5e7eb; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); }
    .card-header { background: var(--main-blue); color: white; padding: 12px 20px; font-weight: 600; }
    
    .menu-item { background: white; border: 1px solid #e5e7eb; border-radius: 8px; margin-bottom: 15px; overflow: hidden; }
    .menu-header { background: #fff; padding: 18px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; font-weight: 700; transition: 0.2s; }
    .menu-header:hover { background: #f9fafb; }
    .menu-content { padding: 20px; display: none; border-top: 1px solid #f3f4f6; }
    .menu-content.active { display: block; }
    
    .input-group { margin-bottom: 15px; }
    .input-group label { display: block; font-size: 0.8rem; font-weight: 600; color: #4b5563; margin-bottom: 5px; }
    input, select { width: 100%; padding: 10px; border: 1px solid #d1d5db; border-radius: 6px; box-sizing: border-box; }
    
    .btn { background: var(--main-blue); color: white; border: none; padding: 12px; border-radius: 6px; cursor: pointer; width: 100%; font-weight: 600; transition: 0.3s; }
    .btn:hover { opacity: 0.9; transform: translateY(-1px); }
    
    .history-card { display: flex; gap: 15px; padding: 12px; border-bottom: 1px solid #f3f4f6; text-decoration: none; color: inherit; align-items: center; }
    .history-card:hover { background: #f8fafc; }
    .history-card img { width: 45px; height: 65px; object-fit: cover; border-radius: 4px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    
    .status-badge { font-size: 0.7rem; padding: 2px 8px; border-radius: 12px; background: #dcfce7; color: #166534; }
</style>
`;

// --- [6] المسارات التشغيلية ---

app.get('/', (req, res) => {
    const historyHtml = history.map(h => `
        <a href="/content/${encodeURIComponent(h.id)}" class="history-card">
            <img src="${h.poster}" onerror="this.src='https://via.placeholder.com/45x65'">
            <div style="flex:1">
                <div style="font-weight:700; font-size:14px;">${h.name}</div>
                <div style="font-size:11px; color:#6b7280;">ID: ${h.id} • ${h.type}</div>
            </div>
            <span class="status-badge">Selected</span>
        </a>`).join('');

    res.send(`<!DOCTYPE html><html><head><title>Subtitle Studio</title>${fullStyle}</head><body>
        <div class="nav"><b>ABDULLAH STUDIO</b> <div class="nav-links"><a href="/">Dashboard</a><a href="/admin">Control Panel</a></div></div>
        <div class="container">
            <div class="sidebar">
                <div class="card"><div class="card-header">Addon Status</div><div style="padding:20px; font-size:13px; color:#4b5563;">Server is running.<br>Connection: <b>Live</b><br>Total DB: ${db.length} entries</div></div>
            </div>
            <div class="main">
                <div class="menu-item">
                    <div class="menu-header" onclick="this.nextElementSibling.classList.toggle('active')"><span>🚀 UPLOAD SUBTITLES (ADD CONTENT)</span><span>▼</span></div>
                    <div class="menu-content active">
                        <form action="/process-work" method="POST">
                            <div class="input-group"><label>IMDB ID or KITSU ID</label><input name="id" placeholder="tt1234567:1:1" required></div>
                            <div class="input-group"><label>CONTENT TYPE</label><select name="type"><option value="movie">Movie</option><option value="series">Series</option><option value="anime">Anime</option></select></div>
                            <button class="btn">Search & Initialize Work</button>
                        </form>
                    </div>
                </div>
                <div class="menu-item">
                    <div class="menu-header" onclick="this.nextElementSibling.classList.toggle('active')"><span>📂 SELECTED SUBTITLES (RECENT HISTORY)</span><span>▼</span></div>
                    <div class="menu-content active">${historyHtml || '<p style="text-align:center; color:#999; font-size:13px;">No history yet. Start by adding a work above.</p>'}</div>
                </div>
            </div>
        </div>
    </body></html>`);
});

app.post('/process-work', async (req, res) => {
    const { id, type } = req.body;
    const meta = await getDetailedMeta(type, id);
    if (!history.find(h => h.id === id)) {
        history.unshift({ id, type, ...meta, timestamp: Date.now() });
        history = history.slice(0, 30); // Keep last 30
        saveData();
    }
    res.redirect(`/content/${encodeURIComponent(id)}`);
});

app.get('/content/:id', (req, res) => {
    const item = history.find(h => h.id === req.params.id) || { id: req.params.id, name: "Unknown", poster: "" };
    const subs = db.filter(s => s.id === req.params.id);

    res.send(`<html><head>${fullStyle}</head><body>
        <div class="nav"><b>Detail View</b><div class="nav-links"><a href="/">Dashboard</a></div></div>
        <div class="container">
            <div class="sidebar"><div class="card"><img src="${item.poster}" style="width:100%"><div class="card-header">Meta Info</div><div style="padding:15px; font-size:12px;">ID: ${item.id}</div></div></div>
            <div class="main">
                <div style="background:var(--dark); color:white; padding:30px; border-radius:8px; margin-bottom:25px;">
                    <h1 style="margin:0; font-size:1.5rem;">${item.name}</h1>
                    <p style="margin:10px 0 0 0; color:#9ca3af; font-size:0.9rem;">Management console for this specific content.</p>
                </div>
                <div class="menu-item">
                    <div class="menu-header"><span>📤 UPLOAD NEW SUBTITLE FILE</span></div>
                    <div class="menu-content active">
                        <form action="/upload" method="POST" enctype="multipart/form-data">
                            <input type="hidden" name="imdbId" value="${item.id}">
                            <div class="input-group"><label>Select .SRT File</label><input type="file" name="subFile" accept=".srt" required></div>
                            <div class="input-group"><label>Subtitle Label (Arabic, English, etc.)</label><input name="label" placeholder="e.g. Arabic HDRip-XviD" required></div>
                            <button class="btn" style="background:#10b981">Publish to Stremio</button>
                        </form>
                    </div>
                </div>
                <div class="card"><div class="card-header" style="background:#4b5563">Active Links</div>
                    <div style="padding:10px;">
                        ${subs.map(s => `<div style="padding:10px; background:#f9fafb; border:1px solid #eee; margin-bottom:5px; border-radius:4px; font-size:13px;"><b>${s.label}</b><br><small style="color:#2563eb">${s.url}</small></div>`).join('') || 'No subtitles uploaded for this ID yet.'}
                    </div>
                </div>
            </div>
        </div>
    </body></html>`);
});

app.post('/upload', upload.single('subFile'), (req, res) => {
    if (req.file) {
        db.push({
            id: req.body.imdbId,
            url: `https://${req.get('host')}/download/${req.file.filename}`,
            label: req.body.label,
            filename: req.file.filename,
            date: new Date().toISOString()
        });
        saveData();
    }
    res.redirect('/content/' + encodeURIComponent(req.body.imdbId));
});

app.get('/admin', (req, res) => {
    const list = db.map((s, i) => `
        <div class="history-card">
            <div style="flex:1"><b>${s.label}</b><br><small>${s.id} - ${s.date}</small></div>
            <a href="/delete/${i}" style="color:#ef4444; font-weight:600; font-size:12px;">DELETE</a>
        </div>`).join('');
    res.send(`<html><head>${fullStyle}</head><body><div class="container" style="grid-template-columns:1fr;"><div class="card"><div class="card-header" style="background:#ef4444">Global Subtitle Management</div><div style="padding:20px;">${list || 'Database is empty.'}</div></div></div></body></html>`);
});

app.get('/delete/:index', (req, res) => {
    const item = db[req.params.index];
    if (item && item.filename) {
        const filePath = path.join(SUB_DIR, item.filename);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
    db.splice(req.params.index, 1);
    saveData();
    res.redirect('/admin');
});

// --- [7] Stremio Addon Logic ---
builder.defineSubtitlesHandler(async (args) => {
    const found = db.filter(s => s.id === args.id).map(s => ({
        id: s.url,
        url: s.url,
        lang: "ara",
        label: s.label
    }));
    return { subtitles: found };
});

app.get('/manifest.json', (req, res) => res.json(manifest));
app.get('/subtitles/:type/:id/:extra?.json', (req, res) => {
    builder.getInterface().get('subtitles', req.params.type, req.params.id)
        .then(r => res.json(r)).catch(() => res.json({ subtitles: [] }));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`[SERVER ACTIVE] Port: ${PORT}`));
