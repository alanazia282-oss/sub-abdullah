const express = require('express');
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
    catalogs: [] 
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
            name: "Loading details...", 
            poster: `https://images.metahub.space/poster/medium/${cleanId}/img`,
            type: args.type,
            time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
        };
        history = [newEntry, ...history].slice(0, 20);
        saveData();
    }

    // استدعاء التحديث وتمرير النوع والآيدي
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
            // إضافة headers لتجنب الحظر من Cinemeta وزيادة الـ timeout
            const res = await axios.get(`https://v3-cinemeta.strem.io/meta/${type}/${cleanId}.json`, { 
                timeout: 8000,
                headers: { 'User-Agent': 'Stremio-Addon' }
            });

            if (res.data && res.data.meta) {
                const meta = res.data.meta;
                const parts = fullId.split(':');
                
                if (type === 'series' && parts.length >= 3) {
                    const ep = meta.videos?.find(v => v.season == parts[1] && v.number == parts[2]);
                    finalName = ep ? `${meta.name} - S${parts[1]}E${parts[2]} ${ep.title || ''}` : `${meta.name} - S${parts[1]}E${parts[2]}`;
                    finalPoster = (ep && ep.thumbnail) ? ep.thumbnail : (meta.poster || "");
                } else {
                    finalName = meta.name;
                    finalPoster = meta.poster;
                }
            }
        } else if (cleanId.startsWith('kitsu')) {
            const kitsuId = cleanId.split(':')[1];
            const kRes = await axios.get(`https://kitsu.io/api/edge/anime/${kitsuId}`, { timeout: 8000 });
            if (kRes.data && kRes.data.data) {
                const attr = kRes.data.data.attributes;
                const epNum = fullId.split(':')[2] || fullId.split(':')[1];
                finalName = epNum ? `${attr.canonicalTitle} - EP ${epNum}` : attr.canonicalTitle;
                finalPoster = attr.posterImage?.medium || attr.posterImage?.original;
            }
        }

        if (finalName) {
            history = history.map(h => h.id === fullId ? { ...h, name: finalName, poster: finalPoster } : h);
            saveData();
        }
    } catch (e) {
        // طباعة الخطأ الحقيقي في الكونسول لتسهيل الإصلاح
        console.error(`[Meta Error] for ID ${fullId}:`, e.message);
    }
}

// --- [5] واجهة الـ Community Subtitles ---
const dashboardStyle = `
<style>
    body { background-color: #f3f4f6; color: #1f2937; font-family: 'Inter', sans-serif; margin: 0; padding: 0; direction: ltr; }
    .nav { background: #111827; color: white; padding: 12px 50px; display: flex; align-items: center; gap: 25px; }
    .nav .logo { font-weight: 800; font-size: 18px; color: #fff; text-decoration: none; }
    .container { max-width: 1100px; margin: 40px auto; padding: 0 20px; display: grid; grid-template-columns: 1.6fr 1fr; gap: 25px; }
    .card { background: white; border-radius: 8px; border: 1px solid #e5e7eb; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .card-header { background: #f9fafb; padding: 15px 20px; border-bottom: 1px solid #e5e7eb; display: flex; justify-content: space-between; align-items: center; }
    .card-header h2 { font-size: 14px; font-weight: 700; color: #4b5563; margin: 0; }
    .history-list { padding: 15px; }
    .history-item { display: flex; padding: 12px; border: 1px solid #f3f4f6; border-radius: 8px; margin-bottom: 12px; position: relative; }
    .history-item img { width: 90px; height: 55px; object-fit: cover; border-radius: 4px; background: #eee; }
    .item-details { margin-left: 15px; flex-grow: 1; }
    .item-details h3 { font-size: 15px; margin: 0 0 5px 0; color: #111827; }
    .badge { font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px; color: white; background: #374151; }
    .btn-upload { display: inline-block; margin-top: 8px; font-size: 12px; color: #2563eb; text-decoration: none; font-weight: 600; border: 1px solid #2563eb; padding: 3px 10px; border-radius: 4px; }
    .sidebar-body { padding: 20px; font-size: 13px; }
    .install-input { width: 100%; padding: 8px; background: #f9fafb; border: 1px solid #d1d5db; border-radius: 4px; margin: 10px 0; font-size: 11px; }
    .btn-main { display: block; width: 100%; background: #2563eb; color: white; text-align: center; padding: 10px; border-radius: 4px; text-decoration: none; font-weight: 700; }
    .stat-row { display: flex; justify-content: space-between; border-bottom: 1px solid #f3f4f6; padding: 10px 0; }
</style>
`;

app.get('/', (req, res) => {
    let itemsHtml = history.map(h => `
        <div class="history-item">
            <img src="${h.poster}" onerror="this.src='https://via.placeholder.com/90x55?text=No+Image'">
            <div class="item-details">
                <span class="badge" style="background:#eab308">${h.type}</span>
                <h3>${h.name}</h3>
                <code style="font-size:10px; color:#6b7280;">ID: ${h.id}</code><br>
                <a href="/upload-page/${encodeURIComponent(h.id)}" class="btn-upload">+ Upload Subtitle</a>
            </div>
            <div style="font-size:11px; color:#9ca3af;">${h.time}</div>
        </div>
    `).join('');

    res.send(`
        <html><head><title>Community Subtitles</title>${dashboardStyle}</head>
        <body>
            <div class="nav"><a href="/" class="logo">CC Community Subtitles</a></div>
            <div class="container">
                <div class="main-content">
                    <div class="card">
                        <div class="card-header"><h2>Recent Activity</h2></div>
                        <div class="history-list">${itemsHtml || '<div style="text-align:center; padding:40px;">No activity yet.</div>'}</div>
                    </div>
                </div>
                <div class="sidebar">
                    <div class="card" style="margin-bottom:20px;">
                        <div style="background:#166534; color:white; padding:12px;">Addon Installation</div>
                        <div class="sidebar-body">
                            <input class="install-input" readonly value="https://${req.get('host')}/manifest.json">
                            <a href="stremio://${req.get('host')}/manifest.json" class="btn-main">Install Addon</a>
                        </div>
                    </div>
                    <div class="card">
                        <div style="background:#0e7490; color:white; padding:12px;">Stats</div>
                        <div class="sidebar-body">
                            <div class="stat-row"><span>Files</span><span>${db.length}</span></div>
                            <div class="stat-row"><span>History</span><span>${history.length}</span></div>
                        </div>
                    </div>
                </div>
            </div>
            <script>setTimeout(()=> { if(location.pathname==='/') location.reload(); }, 5000);</script>
        </body></html>
    `);
});

// --- المسارات الأخرى ---
app.get('/upload-page/:id', (req, res) => {
    const item = history.find(h => h.id === req.params.id);
    res.send(`<html><head>${dashboardStyle}</head><body>
        <div class="card" style="max-width:500px; margin:100px auto; padding:20px;">
            <h3>Upload Subtitle</h3>
            <p>Target: <b>${item ? item.name : req.params.id}</b></p>
            <form action="/upload" method="POST" enctype="multipart/form-data">
                <input type="hidden" name="imdbId" value="${req.params.id}">
                <input type="file" name="subFile" accept=".srt" required><br><br>
                <input type="text" name="label" placeholder="Label" style="width:100%; padding:8px; margin-bottom:10px;">
                <button type="submit" class="btn-main" style="border:none;">Publish</button>
            </form>
            <a href="/" style="display:block; text-align:center; margin-top:10px; color:#9ca3af;">Back</a>
        </div></body></html>`);
});

app.post('/upload', upload.single('subFile'), (req, res) => {
    if (req.file) {
        db.push({ id: req.body.imdbId, url: `https://${req.get('host')}/download/${req.file.filename}`, label: req.body.label || "Abdullah Sub", filename: req.file.filename });
        saveData();
    }
    res.redirect('/');
});

app.get('/delete/:index', (req, res) => {
    const item = db[req.params.index];
    if (item && item.filename) { try { fs.unlinkSync(path.join(SUB_DIR, item.filename)); } catch(e) {} }
    db.splice(req.params.index, 1);
    saveData();
    res.redirect('/');
});

app.get('/manifest.json', (req, res) => res.json(manifest));
app.get('/subtitles/:type/:id/:extra?.json', (req, res) => {
    builder.getInterface().get('subtitles', req.params.type, req.params.id)
        .then(r => res.json(r)).catch(() => res.json({ subtitles: [] }));
});

app.listen(process.env.PORT || 3000, () => console.log(`Active on port ${process.env.PORT || 3000}`));
