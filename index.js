const express = require('express');
const { addonBuilder } = require('stremio-addon-sdk');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cors = require('cors');

const app = express();

// --- [Data Storage] ---
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

// --- [Server Config] ---
const upload = multer({ dest: 'subtitles/' });
app.use(cors());
app.use(express.json());
app.use('/download', express.static('subtitles'));

// --- [Addon Manifest] ---
const manifest = {
    id: "org.abdullah.community.style",
    version: "2.0.0",
    name: "Stremio Community Subtitles",
    description: "Personal Subtitle Manager",
    resources: ["subtitles"],
    types: ["movie", "series", "anime"],
    idPrefixes: ["tt", "kitsu"]
};
const builder = new addonBuilder(manifest);

builder.defineSubtitlesHandler(async (args) => {
    const fullId = args.id;
    const cleanId = fullId.split(':')[0];
    let existingEntry = history.find(h => h.id === fullId);
    if (!existingEntry) {
        history = [{ id: fullId, name: "Fetching Data...", poster: `https://images.metahub.space/poster/medium/${cleanId}/img`, type: args.type }, ...history].slice(0, 20);
        saveData();
    }
    updateMeta(args.type, fullId, cleanId);
    return { subtitles: db.filter(s => s.id === fullId).map(s => ({ id: s.url, url: s.url, lang: "ara", label: s.label })) };
});

async function updateMeta(type, fullId, cleanId) {
    try {
        const res = await axios.get(`https://v3-cinemeta.strem.io/meta/${type}/${cleanId}.json`);
        if (res.data.meta) {
            let name = res.data.meta.name;
            let poster = res.data.meta.poster;
            const parts = fullId.split(':');
            if (type === 'series' && parts[1]) {
                const ep = res.data.meta.videos.find(v => v.season == parts[1] && v.number == parts[2]);
                name += ` - S${parts[1]}E${parts[2]}`;
                if (ep?.thumbnail) poster = ep.thumbnail;
            }
            history = history.map(h => h.id === fullId ? { ...h, name, poster } : h);
            saveData();
        }
    } catch (e) {}
}

// --- [The Exact Community UI] ---
const THEME = `
<style>
    :root { --bg-color: #0c0d10; --card-bg: #16181d; --text-main: #ffffff; --text-dim: #9ca3af; --accent: #e5e7eb; --border: #262930; }
    body { background-color: var(--bg-color); color: var(--text-main); font-family: 'Inter', -apple-system, sans-serif; margin: 0; padding: 0; line-height: 1.5; }
    .nav { padding: 3rem 2rem 1rem; text-align: center; }
    .nav h1 { font-size: 2.5rem; font-weight: 900; letter-spacing: -0.05em; margin: 0; }
    .nav p { color: var(--text-dim); margin-top: 0.5rem; font-size: 1.1rem; }
    .container { max-width: 1000px; margin: 0 auto; padding: 2rem; }
    .install-box { background: var(--card-bg); border: 1px solid var(--border); border-radius: 12px; padding: 1.5rem; margin-bottom: 3rem; display: flex; align-items: center; gap: 1rem; }
    .install-box input { background: transparent; border: none; color: var(--text-main); flex: 1; font-family: monospace; font-size: 0.95rem; outline: none; }
    .btn-install { background: #fff; color: #000; padding: 0.6rem 1.2rem; border-radius: 8px; text-decoration: none; font-weight: 700; font-size: 0.9rem; white-space: nowrap; }
    .section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; border-bottom: 1px solid var(--border); padding-bottom: 0.5rem; }
    .section-header h2 { font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.1em; color: var(--text-dim); margin: 0; }
    .history-list { display: grid; gap: 1rem; }
    .item { background: var(--card-bg); border: 1px solid var(--border); border-radius: 12px; padding: 1rem; display: flex; align-items: center; transition: all 0.2s ease; }
    .item:hover { border-color: #4b5563; background: #1c1f26; }
    .item img { width: 48px; height: 68px; border-radius: 6px; object-fit: cover; background: #000; }
    .item-info { flex: 1; margin-left: 1.2rem; }
    .item-info h3 { margin: 0; font-size: 1.1rem; font-weight: 600; }
    .item-info span { color: var(--text-dim); font-size: 0.85rem; font-family: monospace; }
    .upload-link { color: var(--text-main); text-decoration: none; font-weight: 600; font-size: 0.9rem; padding: 0.5rem 1rem; border: 1px solid var(--border); border-radius: 8px; transition: 0.2s; }
    .upload-link:hover { background: #fff; color: #000; }
</style>
`;

app.get('/', (req, res) => {
    const list = history.map(h => `
        <div class="item">
            <img src="${h.poster}" onerror="this.src='https://via.placeholder.com/48x68'">
            <div class="item-info">
                <h3>${h.name}</h3>
                <span>${h.id}</span>
            </div>
            <a href="/upload-page/${encodeURIComponent(h.id)}" class="upload-link">Upload</a>
        </div>
    `).join('');

    res.send(`<html><head><title>Stremio Community Subtitles</title>${THEME}</head><body>
        <div class="nav">
            <h1>Community <span style="font-weight:200">Subtitles</span></h1>
            <p>Your personal subtitle manager for Stremio</p>
        </div>
        <div class="container">
            <div class="install-box">
                <input value="https://${req.get('host')}/manifest.json" readonly onclick="this.select()">
                <a href="stremio://${req.get('host')}/manifest.json" class="btn-install">Install Addon</a>
            </div>
            <div class="section-header"><h2>Recent Activity</h2><a href="/admin" style="color:var(--text-dim); text-decoration:none; font-size:0.8rem;">Manage Files</a></div>
            <div class="history-list">${list || '<div style="text-align:center; padding:3rem; color:var(--text-dim);">No activity yet. Watch something on Stremio!</div>'}</div>
        </div>
        <script>setTimeout(()=>location.reload(), 8000);</script>
    </body></html>`);
});

app.get('/upload-page/:id', (req, res) => {
    res.send(`<html><head>${THEME}</head><body><div class="container" style="max-width:500px; margin-top:100px;">
        <div class="install-box" style="flex-direction:column; align-items:flex-start;">
            <h2 style="margin:0 0 1rem 0">Upload Subtitle</h2>
            <form action="/upload" method="POST" enctype="multipart/form-data" style="width:100%">
                <input type="hidden" name="imdbId" value="${req.params.id}">
                <p style="font-size:0.8rem; color:var(--text-dim)">Format: .SRT only</p>
                <input type="file" name="subFile" accept=".srt" required style="margin-bottom:1rem; display:block;">
                <input type="text" name="label" placeholder="Subtitle Label (e.g. Abdullah)" style="background:#000; border:1px solid var(--border); border-radius:8px; padding:0.8rem; width:100%; box-sizing:border-box; margin-bottom:1.5rem; color:#fff;">
                <button type="submit" class="btn-install" style="width:100%; cursor:pointer; padding:1rem;">Publish Subtitle</button>
            </form>
            <a href="/" style="color:var(--text-dim); text-decoration:none; font-size:0.8rem; margin-top:1rem; align-self:center;">Cancel</a>
        </div>
    </div></body></html>`);
});

app.post('/upload', upload.single('subFile'), (req, res) => {
    if (req.file) {
        db.push({ id: req.body.imdbId, url: `https://${req.get('host')}/download/${req.file.filename}`, label: req.body.label || "Abdullah Sub", filename: req.file.filename });
        saveData();
    }
    res.redirect('/');
});

app.get('/admin', (req, res) => {
    const list = db.map((s, i) => `<div class="item"><div class="item-info"><h3>${s.label}</h3><span>${s.id}</span></div><a href="/delete/${i}" class="upload-link" style="color:#ff4444; border-color:#ff4444;">Delete</a></div>`).join('');
    res.send(`<html><head>${THEME}</head><body><div class="container"><h2>Manage Files</h2><div class="history-list">${list}</div><br><a href="/" class="upload-link">Back</a></div></body></html>`);
});

app.get('/delete/:i', (req, res) => {
    const s = db[req.params.i];
    if (s?.filename) { try { fs.unlinkSync(path.join(SUB_DIR, s.filename)); } catch(e){} }
    db.splice(req.params.i, 1);
    saveData();
    res.redirect('/admin');
});

app.get('/manifest.json', (req, res) => res.json(manifest));
app.get('/subtitles/:type/:id/:extra?.json', (req, res) => {
    builder.getInterface().get('subtitles', req.params.type, req.params.id).then(r => res.json(r)).catch(()=>res.json({subtitles:[]}));
});

app.listen(process.env.PORT || 3000);
