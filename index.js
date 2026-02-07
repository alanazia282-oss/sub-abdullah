const express = require('express');
const { addonBuilder } = require('stremio-addon-sdk');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cors = require('cors');

const app = express();

// --- [1] Data Management (Original Logic) ---
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

// --- [2] Server Setup ---
const upload = multer({ dest: 'subtitles/' });
app.use(cors());
app.use(express.json());
app.use('/download', express.static('subtitles'));

// --- [3] Stremio Manifest ---
const manifest = {
    id: "org.abdullah.ultimate.v12",
    version: "12.0.0",
    name: "Abdullah Community Subs",
    description: "Community style subtitle manager",
    resources: ["subtitles"],
    types: ["movie", "series", "anime"],
    idPrefixes: ["tt", "kitsu"]
};
const builder = new addonBuilder(manifest);

// --- [4] Subtitles Handler (Original Logic) ---
builder.defineSubtitlesHandler(async (args) => {
    const fullId = args.id;
    const cleanId = fullId.split(':')[0];

    let existingEntry = history.find(h => h.id === fullId);
    if (!existingEntry) {
        const newEntry = {
            id: fullId,
            name: "Loading details...",
            poster: `https://images.metahub.space/poster/medium/${cleanId}/img`,
            type: args.type,
            time: new Date().toISOString().replace('T', ' ').substring(0, 16)
        };
        history = [newEntry, ...history].slice(0, 10);
        saveData();
    }
    updateMetaInBackground(args.type, fullId, cleanId);

    const foundSubs = db.filter(s => s.id === fullId).map(s => ({
        id: s.url,
        url: s.url,
        lang: "ara",
        label: s.label || "Abdullah Sub"
    }));
    return { subtitles: foundSubs };
});

async function updateMetaInBackground(type, fullId, cleanId) {
    try {
        let finalName = "";
        let finalPoster = "";
        const res = await axios.get(`https://v3-cinemeta.strem.io/meta/${type}/${cleanId}.json`, { timeout: 5000 });
        if (res.data && res.data.meta) {
            const meta = res.data.meta;
            const parts = fullId.split(':');
            if (type === 'series' && parts[1]) {
                const ep = meta.videos?.find(v => v.season == parts[1] && v.number == parts[2]);
                finalName = `${meta.name} - S${parts[1]}E${parts[2]} ${ep ? ep.title : ''}`;
                finalPoster = (ep && ep.thumbnail) ? ep.thumbnail : meta.poster;
            } else {
                finalName = meta.name;
                finalPoster = meta.poster;
            }
            history = history.map(h => h.id === fullId ? { ...h, name: finalName, poster: finalPoster } : h);
            saveData();
        }
    } catch (e) {}
}

// --- [5] The Exact Community Subtitles UI (English) ---
const UI_CSS = `
<style>
    body { background-color: #f4f7f6; color: #333; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 0; }
    .top-nav { background: #1e293b; color: white; padding: 10px 50px; display: flex; align-items: center; font-size: 14px; }
    .top-nav .brand { font-weight: bold; display: flex; align-items: center; margin-right: 30px; }
    .top-nav a { color: #cbd5e1; text-decoration: none; margin-right: 20px; }
    .container { max-width: 1100px; margin: 30px auto; padding: 20px; }
    .header-section { margin-bottom: 30px; }
    .header-section h1 { font-size: 28px; margin: 0; color: #1e293b; }
    .header-section p { color: #64748b; margin: 5px 0; }
    .main-grid { display: grid; grid-template-columns: 1.5fr 1fr; gap: 25px; }
    .card { background: white; border-radius: 8px; border: 1px solid #e2e8f0; box-shadow: 0 2px 4px rgba(0,0,0,0.05); overflow: hidden; }
    .card-header { background: #f8fafc; padding: 12px 20px; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; }
    .card-header h2 { font-size: 15px; margin: 0; color: #475569; text-transform: capitalize; }
    .badge-count { background: #2563eb; color: white; padding: 2px 8px; border-radius: 10px; font-size: 11px; }
    .recent-list { padding: 15px; }
    .recent-item { display: flex; padding: 15px; border: 1px solid #f1f5f9; border-radius: 6px; margin-bottom: 10px; position: relative; }
    .recent-item img { width: 50px; height: 75px; object-fit: cover; border-radius: 4px; margin-right: 15px; }
    .item-info { flex: 1; }
    .item-info h3 { font-size: 14px; margin: 0 0 5px 0; color: #1e293b; }
    .tag { font-size: 10px; padding: 2px 6px; border-radius: 4px; font-weight: bold; margin-right: 5px; color: white; }
    .tag-series { background: #eab308; }
    .tag-hash { background: #475569; }
    .tag-id { background: #000; }
    .time-stamp { font-size: 11px; color: #94a3b8; position: absolute; top: 15px; right: 40px; }
    .delete-btn { position: absolute; right: 15px; bottom: 15px; color: #ef4444; cursor: pointer; text-decoration: none; }
    .sidebar-card { margin-bottom: 20px; }
    .green-header { background: #15803d; color: white; padding: 10px 15px; font-weight: bold; font-size: 14px; }
    .blue-header { background: #0891b2; color: white; padding: 10px 15px; font-weight: bold; font-size: 14px; }
    .install-body { padding: 20px; font-size: 13px; color: #475569; }
    .btn-primary { background: #2563eb; color: white; border: none; padding: 10px; border-radius: 4px; width: 100%; display: block; text-align: center; text-decoration: none; font-weight: bold; margin-top: 15px; }
    .stat-row { display: flex; justify-content: space-between; padding: 10px 15px; border: 1px solid #e2e8f0; margin: 10px 15px; border-radius: 6px; font-size: 13px; }
    .stat-val { background: #1e293b; color: white; border-radius: 50%; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; font-size: 10px; }
    .upload-btn-mini { font-size: 11px; color: #2563eb; text-decoration: none; border: 1px solid #2563eb; padding: 2px 8px; border-radius: 4px; margin-top: 5px; display: inline-block; }
</style>
`;

app.get('/', (req, res) => {
    const listHtml = history.map(h => `
        <div class="recent-item">
            <img src="${h.poster}" onerror="this.src='https://via.placeholder.com/50x75'">
            <div class="item-info">
                <h3>${h.name}</h3>
                <div>
                    <span class="tag tag-series">${h.type}</span>
                    <span class="tag tag-id">ID: ${h.id}</span>
                </div>
                <a href="/upload-page/${encodeURIComponent(h.id)}" class="upload-btn-mini">+ Upload Subtitle</a>
            </div>
            <div class="time-stamp">${h.time}</div>
            <a href="/delete-history/${encodeURIComponent(h.id)}" class="delete-btn">🗑</a>
        </div>
    `).join('');

    res.send(`
        <html><head><title>Dashboard - Community Subtitles</title>${UI_CSS}</head>
        <body>
            <div class="top-nav">
                <div class="brand">CC Community Subtitles</div>
                <a href="/">Dashboard</a>
                <a href="#">Install Addon</a>
                <div style="margin-left:auto; display:flex; align-items:center;">
                    <a href="#">Upload Subtitles</a>
                    <span>👤 USER_LOGGED_IN</span>
                </div>
            </div>
            <div class="container">
                <div class="header-section">
                    <h1>Your Dashboard</h1>
                    <p>Welcome back! Here's your recent activity and subtitle history.</p>
                </div>
                <div class="main-grid">
                    <div class="card">
                        <div class="card-header">
                            <h2>Recent Activity</h2>
                            <span class="badge-count">${history.length} Items</span>
                        </div>
                        <div class="recent-list">
                            <p style="font-size:12px; color:#94a3b8; margin-bottom:15px;">We store only your last activities.</p>
                            ${listHtml || '<p>No recent activity found.</p>'}
                        </div>
                    </div>
                    <div class="sidebar">
                        <div class="card sidebar-card">
                            <div class="green-header">Addon Installation</div>
                            <div class="install-body">
                                Install the addon in Stremio to start using community subtitles:
                                <input readonly value="https://${req.get('host')}/manifest.json" style="width:100%; margin-top:10px; padding:5px; border:1px solid #ddd; font-size:11px;">
                                <a href="stremio://${req.get('host')}/manifest.json" class="btn-primary">Install Addon</a>
                            </div>
                        </div>
                        <div class="card sidebar-card">
                            <div class="blue-header">Your Stats</div>
                            <div class="stat-row"><span>Uploaded Subtitles</span><span class="stat-val">${db.length}</span></div>
                            <div class="stat-row"><span>Selected Subtitles</span><span class="stat-val">${history.length}</span></div>
                            <div class="stat-row"><span>Votes Cast</span><span class="stat-val">0</span></div>
                            <center><a href="/admin" style="font-size:11px; color:#64748b; text-decoration:none; padding-bottom:10px; display:block;">Manage My Uploads</a></center>
                        </div>
                    </div>
                </div>
            </div>
            <script>setTimeout(()=> location.reload(), 15000);</script>
        </body></html>
    `);
});

// --- Other Routes (Upload/Admin/Delete) ---
app.get('/upload-page/:id', (req, res) => {
    res.send(`<html><head>${UI_CSS}</head><body><div class="container" style="max-width:500px">
        <div class="card"><div class="card-header"><h2>Upload for ${req.params.id}</h2></div>
        <form action="/upload" method="POST" enctype="multipart/form-data" style="padding:20px">
            <input type="hidden" name="imdbId" value="${req.params.id}">
            <input type="file" name="subFile" accept=".srt" required><br><br>
            <input type="text" name="label" placeholder="Your Name" style="width:100%; padding:8px; margin-bottom:15px">
            <button type="submit" class="btn-primary">Publish</button>
        </form></div></div></body></html>`);
});

app.post('/upload', upload.single('subFile'), (req, res) => {
    if (req.file) {
        db.push({ id: req.body.imdbId, url: `https://${req.get('host')}/download/${req.file.filename}`, label: req.body.label || "User Sub", filename: req.file.filename });
        saveData();
    }
    res.redirect('/');
});

app.get('/admin', (req, res) => {
    let list = db.map((s, i) => `<div class="recent-item"><div class="item-info"><h3>${s.label}</h3><small>${s.id}</small></div><a href="/delete/${i}" class="delete-btn">Remove</a></div>`).join('');
    res.send(`<html><head>${UI_CSS}</head><body><div class="container"><h1>Manage Files</h1><div class="card" style="padding:20px">${list}</div><br><a href="/">Back</a></div></body></html>`);
});

app.get('/delete/:i', (req, res) => {
    const item = db[req.params.i];
    if (item?.filename) { try { fs.unlinkSync(path.join(SUB_DIR, item.filename)); } catch(e){} }
    db.splice(req.params.i, 1);
    saveData();
    res.redirect('/admin');
});

app.get('/delete-history/:id', (req, res) => {
    history = history.filter(h => h.id !== req.params.id);
    saveData();
    res.redirect('/');
});

app.get('/manifest.json', (req, res) => res.json(manifest));
app.get('/subtitles/:type/:id/:extra?.json', (req, res) => {
    builder.getInterface().get('subtitles', req.params.type, req.params.id).then(r => res.json(r)).catch(()=>res.json({subtitles:[]}));
});

app.listen(process.env.PORT || 3000, () => console.log('Exact Community UI Running'));
