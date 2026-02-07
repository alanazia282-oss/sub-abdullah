const express = require('express');
const { addonBuilder } = require('stremio-addon-sdk');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cors = require('cors');

const app = express();

// --- [1] إعدادات المجلدات والملفات ---
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

// --- [2] إعدادات السيرفر ---
const upload = multer({ dest: 'subtitles/' });
app.use(cors());
app.use(express.json());
app.use('/download', express.static('subtitles'));

// --- [3] Stremio Manifest ---
const manifest = {
    id: "org.abdullah.ultimate.v12",
    version: "12.0.0",
    name: "Community Subtitles",
    description: "Official Community Style Subtitle Manager",
    resources: ["subtitles"],
    types: ["movie", "series", "anime"],
    idPrefixes: ["tt", "kitsu"]
};
const builder = new addonBuilder(manifest);

// --- [4] المحرك (يربط ستريميو بالموقع) ---
builder.defineSubtitlesHandler(async (args) => {
    const fullId = args.id;
    const cleanId = fullId.split(':')[0];

    // إضافة الحلقة للهستوري فوراً
    let existingEntry = history.find(h => h.id === fullId);
    if (!existingEntry) {
        const newEntry = {
            id: fullId,
            name: "Fetching...", 
            poster: `https://images.metahub.space/poster/medium/${cleanId}/img`,
            type: args.type,
            time: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
        };
        history = [newEntry, ...history].slice(0, 20);
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
        if (cleanId.startsWith('tt')) {
            const res = await axios.get(`https://v3-cinemeta.strem.io/meta/${type}/${cleanId}.json`, { timeout: 5000 });
            if (res.data && res.data.meta) {
                const meta = res.data.meta;
                const parts = fullId.split(':');
                if (type === 'series' && parts[1]) {
                    finalName = `${meta.name} - S${parts[1]}E${parts[2]}`;
                    finalPoster = meta.poster;
                } else {
                    finalName = meta.name;
                    finalPoster = meta.poster;
                }
            }
        } else if (cleanId.startsWith('kitsu')) {
            const kitsuId = cleanId.replace('kitsu:', '');
            const kRes = await axios.get(`https://kitsu.io/api/edge/anime/${kitsuId}`, { timeout: 5000 });
            if (kRes.data && kRes.data.data) {
                const attr = kRes.data.data.attributes;
                finalName = attr.canonicalTitle;
                finalPoster = attr.posterImage.medium;
            }
        }
        if (finalName) {
            history = history.map(h => h.id === fullId ? { ...h, name: finalName, poster: finalPoster } : h);
            saveData();
        }
    } catch (e) {}
}

// --- [5] الواجهة (CSS + HTML) ---
const dashboardStyle = `
<style>
    body { background-color: #f3f4f6; color: #1f2937; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; direction: ltr; }
    .nav { background: #111827; color: white; padding: 15px 50px; display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #3b82f6; }
    .nav a { color: white; text-decoration: none; font-weight: bold; margin-left: 20px; }
    .container { max-width: 1200px; margin: 40px auto; padding: 0 20px; display: grid; grid-template-columns: 1.8fr 1fr; gap: 30px; }
    .card { background: white; border-radius: 12px; border: 1px solid #e5e7eb; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); overflow: hidden; margin-bottom: 25px; }
    .card-header { background: #f9fafb; padding: 18px 25px; border-bottom: 1px solid #e5e7eb; font-weight: 800; font-size: 16px; color: #374151; display: flex; justify-content: space-between; }
    .history-item { display: flex; padding: 15px; border-bottom: 1px solid #f3f4f6; align-items: center; transition: 0.2s; }
    .history-item:hover { background: #f8fafc; }
    .history-item img { width: 65px; height: 95px; object-fit: cover; border-radius: 6px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    .item-details { margin-left: 20px; flex-grow: 1; }
    .item-details h3 { font-size: 17px; margin: 0 0 8px 0; color: #111827; }
    .btn-upload { display: inline-block; background: #2563eb; color: white !important; padding: 6px 15px; border-radius: 6px; font-size: 12px; text-decoration: none !important; transition: 0.2s; }
    .btn-upload:hover { background: #1d4ed8; }
    .sidebar-link { display: flex; justify-content: space-between; align-items: center; padding: 15px 20px; text-decoration: none; color: #4b5563; border-bottom: 1px solid #f3f4f6; font-weight: 600; }
    .sidebar-link:hover { background: #f9fafb; color: #2563eb; }
    .stat-badge { background: #111827; color: white; min-width: 25px; height: 25px; padding: 0 5px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; }
    .green-head { background: #059669; color: white; padding: 15px; font-weight: bold; }
    .blue-head { background: #0891b2; color: white; padding: 15px; font-weight: bold; }
</style>
`;

app.get('/', (req, res) => {
    let itemsHtml = history.map(h => `
        <div class="history-item">
            <img src="${h.poster}" onerror="this.src='https://via.placeholder.com/65x95?text=No+Poster'">
            <div class="item-details">
                <span style="font-size:10px; background:#fbbf24; color:black; padding:2px 6px; border-radius:4px; font-weight:bold;">${h.type.toUpperCase()}</span>
                <h3>${h.name}</h3>
                <a href="/upload-page/${encodeURIComponent(h.id)}" class="btn-upload">+ Upload Translation</a>
            </div>
            <div style="font-size:11px; color:#6b7280; font-weight:bold;">${h.time}</div>
        </div>
    `).join('');

    res.send(`
        <html><head><title>Subtitle Dashboard</title>${dashboardStyle}</head>
        <body>
            <div class="nav">
                <div style="font-size:20px; font-weight:800;">SUB-COMMUNITY</div>
                <div><a href="/">Dashboard</a><a href="/admin">Manage</a></div>
            </div>
            <div class="container">
                <div class="main">
                    <h2 style="margin-top:0;">Activity Feed (Selected)</h2>
                    <div class="card">
                        <div class="card-header">RECENTLY WATCHED IN STREMIO</div>
                        <div style="min-height:200px;">${itemsHtml || '<p style="padding:40px; text-align:center; color:#9ca3af;">Play something in Stremio to start!</p>'}</div>
                    </div>
                </div>
                <div class="sidebar">
                    <div class="card">
                        <div class="green-head">Quick Install</div>
                        <div style="padding:20px;">
                            <input style="width:100%; padding:10px; border:1px solid #ddd; border-radius:6px;" readonly value="http://${req.get('host')}/manifest.json">
                            <a href="stremio://${req.get('host')}/manifest.json" style="display:block; background:#10b981; color:white; text-align:center; padding:12px; margin-top:15px; text-decoration:none; border-radius:6px; font-weight:bold;">Install Addon</a>
                        </div>
                    </div>
                    <div class="card">
                        <div class="blue-head">System Status</div>
                        <a href="/admin" class="sidebar-link"><span>Uploaded Files</span><span class="stat-badge">${db.length}</span></a>
                        <a href="/" class="sidebar-link"><span>Selected (History)</span><span class="stat-badge">${history.length}</span></a>
                        <div style="padding:20px;">
                            <a href="/admin" style="display:block; text-align:center; color:#2563eb; font-weight:bold; text-decoration:none; font-size:14px;">View Full Statistics →</a>
                        </div>
                    </div>
                </div>
            </div>
            <script>setTimeout(() => { location.reload(); }, 7000);</script>
        </body></html>
    `);
});

// --- صفحة الرفع (Upload) ---
app.get('/upload-page/:id', (req, res) => {
    const item = history.find(h => h.id === req.params.id);
    res.send(`<html><head>${dashboardStyle}</head><body style="display:flex; align-items:center; justify-content:center; height:100vh;">
        <div class="card" style="width:450px; padding:30px;">
            <h2 style="margin-top:0;">Upload to:</h2>
            <p style="background:#f3f4f6; padding:10px; border-radius:6px; font-weight:bold;">${item ? item.name : req.params.id}</p>
            <form action="/upload" method="POST" enctype="multipart/form-data">
                <input type="hidden" name="imdbId" value="${req.params.id}">
                <div style="margin-bottom:20px;">
                    <label style="display:block; margin-bottom:8px; font-weight:bold;">Select SRT File:</label>
                    <input type="file" name="subFile" accept=".srt" required>
                </div>
                <div style="margin-bottom:20px;">
                    <label style="display:block; margin-bottom:8px; font-weight:bold;">Label:</label>
                    <input type="text" name="label" placeholder="Example: Arabic by Abdullah" required style="width:100%; padding:10px; border:1px solid #ddd; border-radius:6px;">
                </div>
                <button type="submit" style="width:100%; background:#2563eb; color:white; border:none; padding:12px; border-radius:6px; font-weight:bold; cursor:pointer;">Publish Subtitle</button>
            </form>
            <a href="/" style="display:block; text-align:center; margin-top:15px; color:#6b7280; text-decoration:none;">Go Back</a>
        </div></body></html>`);
});

app.post('/upload', upload.single('subFile'), (req, res) => {
    if (req.file) {
        db.push({ id: req.body.imdbId, url: `http://${req.get('host')}/download/${req.file.filename}`, label: req.body.label, filename: req.file.filename });
        saveData();
    }
    res.redirect('/');
});

// --- إدارة الملفات (Admin) ---
app.get('/admin', (req, res) => {
    let rows = db.map((s, i) => `
        <div class="history-item">
            <div class="item-details">
                <div style="font-weight:bold;">${s.label}</div>
                <div style="font-size:12px; color:gray;">Target ID: ${s.id}</div>
            </div>
            <a href="/delete/${i}" style="color:#ef4444; font-weight:bold; text-decoration:none;">Delete</a>
        </div>
    `).join('');
    res.send(`<html><head>${dashboardStyle}</head><body>
        <div class="container" style="grid-template-columns:1fr;">
            <div class="card">
                <div class="card-header">MANAGE UPLOADED SUBTITLES</div>
                <div style="min-height:200px;">${rows || '<p style="padding:40px; text-align:center;">No files uploaded yet.</p>'}</div>
                <div style="padding:20px;"><a href="/" class="btn-upload">Back to Dashboard</a></div>
            </div>
        </div></body></html>`);
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

// --- Stremio Endpoints ---
app.get('/manifest.json', (req, res) => res.json(manifest));
app.get('/subtitles/:type/:id/:extra?.json', (req, res) => {
    builder.getInterface().get('subtitles', req.params.type, req.params.id).then(r => res.json(r));
});

const PORT = 3000;
app.listen(PORT, () => console.log(`Dashboard running on http://localhost:${PORT}`));
