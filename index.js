Const express = require('express');
const { addonBuilder } = require('stremio-addon-sdk');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cors = require('cors');

const app = express();

// --- [1] إعدادات البيئة وقاعدة البيانات ---
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
    description: "Official Community Style Subtitle Manager",
    resources: ["subtitles"],
    types: ["movie", "series", "anime"],
    idPrefixes: ["tt", "kitsu"],
    catalogs: [] // تأكدت أنها مصفوفة فارغة كما كانت
};

const builder = new addonBuilder(manifest);

// --- [4] محرك جلب البيانات الذكي ---
builder.defineSubtitlesHandler(async (args) => {
    const fullId = args.id;
    const cleanId = fullId.split(':')[0];

    let existingEntry = history.find(h => h.id === fullId);
    if (!existingEntry) {
        const newEntry = {
            id: fullId,
            name: "Fetching details...", 
            poster: `https://images.metahub.space/poster/medium/${cleanId}/img`,
            type: args.type,
            time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
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
                    const ep = meta.videos?.find(v => v.season == parts[1] && v.number == parts[2]);
                    finalName = ep ? `${meta.name} - S${parts[1]}E${parts[2]}` : meta.name;
                    finalPoster = (ep && ep.thumbnail) ? ep.thumbnail : meta.poster;
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
                const epNum = fullId.split(':')[1];
                finalName = epNum ? `${attr.canonicalTitle} - EP ${epNum}` : attr.canonicalTitle;
                finalPoster = attr.posterImage.medium || attr.posterImage.original;
            }
        }

        if (finalName) {
            history = history.map(h => h.id === fullId ? { ...h, name: finalName, poster: finalPoster } : h);
            saveData();
        }
    } catch (e) {
        console.error("Meta Update Error");
    }
}

// --- [5] واجهة الـ Community Subtitles (التصميم المطلوب) ---
const dashboardStyle = `
<style>
    body { background-color: #f3f4f6; color: #1f2937; font-family: 'Inter', -apple-system, sans-serif; margin: 0; padding: 0; direction: ltr; }
    .nav { background: #111827; color: white; padding: 12px 50px; display: flex; align-items: center; gap: 25px; font-size: 14px; }
    .nav .logo { font-weight: 800; font-size: 18px; color: #fff; text-decoration: none; }
    .container { max-width: 1100px; margin: 40px auto; padding: 0 20px; display: grid; grid-template-columns: 1.6fr 1fr; gap: 25px; }
    .card { background: white; border-radius: 8px; border: 1px solid #e5e7eb; box-shadow: 0 1px 3px rgba(0,0,0,0.1); overflow: hidden; }
    .card-header { background: #f9fafb; padding: 15px 20px; border-bottom: 1px solid #e5e7eb; display: flex; justify-content: space-between; align-items: center; }
    .card-header h2 { font-size: 14px; font-weight: 700; color: #4b5563; text-transform: uppercase; margin: 0; }
    .history-list { padding: 15px; }
    .history-item { display: flex; padding: 12px; border: 1px solid #f3f4f6; border-radius: 8px; margin-bottom: 12px; position: relative; transition: 0.2s; }
    .history-item:hover { border-color: #3b82f6; background: #f8fafc; }
    .history-item img { width: 55px; height: 80px; object-fit: cover; border-radius: 4px; }
    .item-details { margin-left: 15px; flex-grow: 1; }
    .item-details h3 { font-size: 15px; margin: 0 0 5px 0; color: #111827; }
    .badge { font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px; color: white; background: #374151; text-transform: uppercase; margin-right: 5px; }
    .badge-type { background: #eab308; }
    .time { font-size: 11px; color: #9ca3af; position: absolute; top: 12px; right: 15px; }
    .btn-upload { display: inline-block; margin-top: 8px; font-size: 12px; color: #2563eb; text-decoration: none; font-weight: 600; border: 1px solid #2563eb; padding: 3px 10px; border-radius: 4px; }
    .btn-upload:hover { background: #2563eb; color: #fff; }
    .sidebar-section { margin-bottom: 25px; }
    .green-head { background: #166534; color: white; padding: 12px 15px; font-weight: 700; font-size: 14px; }
    .blue-head { background: #0e7490; color: white; padding: 12px 15px; font-weight: 700; font-size: 14px; }
    .sidebar-body { padding: 20px; font-size: 13px; line-height: 1.6; }
    .install-input { width: 100%; padding: 8px; background: #f9fafb; border: 1px solid #d1d5db; border-radius: 4px; margin: 10px 0; font-family: monospace; font-size: 11px; }
    .btn-main { display: block; width: 100%; background: #2563eb; color: white; text-align: center; padding: 10px; border-radius: 4px; text-decoration: none; font-weight: 700; margin-top: 10px; }
    .stat-row { display: flex; justify-content: space-between; border-bottom: 1px solid #f3f4f6; padding: 10px 0; }
    .stat-circle { background: #111827; color: #fff; width: 22px; height: 22px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 10px; }
</style>
`;

app.get('/', (req, res) => {
    let itemsHtml = history.map(h => `
        <div class="history-item">
            <img src="${h.poster}" onerror="this.src='https://via.placeholder.com/55x80'">
            <div class="item-details">
                <span class="badge badge-type">${h.type}</span>
                <h3>${h.name}</h3>
                <code style="font-size:10px; color:#6b7280;">ID: ${h.id}</code><br>
                <a href="/upload-page/${encodeURIComponent(h.id)}" class="btn-upload">+ Upload Subtitle</a>
            </div>
            <div class="time">${h.time}</div>
        </div>
    `).join('');

    res.send(`
        <html><head><title>Community Subtitles</title>${dashboardStyle}</head>
        <body>
            <div class="nav">
                <a href="/" class="logo">CC Community Subtitles</a>
                <a href="/" style="color:#fff; text-decoration:none;">Dashboard</a>
                <a href="#" style="color:#9ca3af; text-decoration:none;">Addon Installation</a>
            </div>
            <div class="container">
                <div class="main-content">
                    <h1 style="font-size:24px; margin-bottom:5px;">Your Dashboard</h1>
                    <p style="color:#6b7280; margin-bottom:25px;">Welcome back! Here's your recent activity and subtitle history.</p>
                    <div class="card">
                        <div class="card-header">
                            <h2>Recent Activity</h2>
                            <span style="font-size:11px; background:#dbeafe; color:#1e40af; padding:2px 8px; border-radius:10px;">${history.length} ITEMS</span>
                        </div>
                        <div class="history-list">
                            <p style="font-size:12px; color:#9ca3af; margin-bottom:15px;">We store only your last activities.</p>
                            ${itemsHtml || '<div style="text-align:center; padding:40px; color:#9ca3af;">No recent activity yet.</div>'}
                        </div>
                    </div>
                </div>
                <div class="sidebar">
                    <div class="card sidebar-section">
                        <div class="green-head">Addon Installation</div>
                        <div class="sidebar-body">
                            Install the addon in Stremio to start using community subtitles.
                            <input class="install-input" readonly value="https://${req.get('host')}/manifest.json" onclick="this.select()">
                            <a href="stremio://${req.get('host')}/manifest.json" class="btn-main">Install Addon</a>
                        </div>
                    </div>
                    <div class="card sidebar-section">
                        <div class="blue-head">Your Stats</div>
                        <div class="sidebar-body">
                            <div class="stat-row"><span>Uploaded Subtitles</span><span class="stat-circle">${db.length}</span></div>
                            <div class="stat-row"><span>Selected Subtitles</span><span class="stat-circle">${history.length}</span></div>
                            <div class="stat-row"><span>Votes Cast</span><span class="stat-circle">0</span></div>
                            <a href="/admin" style="display:block; text-align:center; margin-top:15px; font-size:12px; color:#6b7280; text-decoration:none;">📂 Manage Uploads</a>
                        </div>
                    </div>
                </div>
            </div>
            <script>setTimeout(()=> { if(location.pathname==='/') location.reload(); }, 15000);</script>
        </body></html>
    `);
});

// --- باقي المسارات (إدارة ورفع) ---
app.get('/upload-page/:id', (req, res) => {
    const item = history.find(h => h.id === req.params.id);
    res.send(`<html><head>${dashboardStyle}</head><body>
        <div class="card" style="max-width:500px; margin:100px auto;">
            <div class="card-header"><h2>Upload Subtitle</h2></div>
            <div class="sidebar-body">
                <p>Content: <b>${item ? item.name : req.params.id}</b></p>
                <form action="/upload" method="POST" enctype="multipart/form-data">
                    <input type="hidden" name="imdbId" value="${req.params.id}">
                    <input type="file" name="subFile" accept=".srt" required style="margin-bottom:15px; display:block;">
                    <input type="text" name="label" placeholder="Subtitle Label (e.g. Your Name)" style="width:100%; padding:10px; margin-bottom:15px; border:1px solid #ddd; border-radius:4px;">
                    <button type="submit" class="btn-main" style="border:none; cursor:pointer;">Publish Subtitle</button>
                </form>
                <a href="/" style="display:block; text-align:center; margin-top:10px; color:#9ca3af; text-decoration:none;">Cancel</a>
            </div>
        </div></body></html>`);
});

app.post('/upload', upload.single('subFile'), (req, res) => {
    if (req.file) {
        db.push({ 
            id: req.body.imdbId, 
            url: `https://${req.get('host')}/download/${req.file.filename}`, 
            label: req.body.label || "Abdullah Sub",
            filename: req.file.filename
        });
        saveData();
    }
    res.redirect('/');
});

app.get('/admin', (req, res) => {
    let list = db.map((s, i) => `
        <div class="history-item">
            <div class="item-details">
                <h3>${s.label}</h3>
                <small>${s.id}</small>
            </div>
            <a href="/delete/${i}" style="color:#ef4444; font-size:12px; text-decoration:none; font-weight:700;">Delete</a>
        </div>`).join('');
    res.send(`<html><head>${dashboardStyle}</head><body>
        <div class="container" style="grid-template-columns: 1fr;">
            <div class="card">
                <div class="card-header"><h2>Manage Uploaded Files</h2></div>
                <div class="history-list">${list || '<p>No files found.</p>'}</div>
                <div class="sidebar-body"><a href="/" class="btn-main" style="max-width:200px">Back to Dashboard</a></div>
            </div>
        </div></body></html>`);
});

app.get('/delete/:index', (req, res) => {
    const item = db[req.params.index];
    if (item && item.filename) { try { fs.unlinkSync(path.join(SUB_DIR, item.filename)); } catch(e) {} }
    db.splice(req.params.index, 1);
    saveData();
    res.redirect('/admin');
});

app.get('/manifest.json', (req, res) => res.json(manifest));
app.get('/subtitles/:type/:id/:extra?.json', (req, res) => {
    builder.getInterface().get('subtitles', req.params.type, req.params.id)
        .then(r => res.json(r)).catch(() => res.json({ subtitles: [] }));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Community System Active on port ${PORT}`));
