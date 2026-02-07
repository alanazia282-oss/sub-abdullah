const express = require('express');
const { addonBuilder } = require('stremio-addon-sdk');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cors = require('cors');

const app = express();
// ريندر يحتاج البورت كذا
const PORT = process.env.PORT || 3000;

// --- [1] إعدادات المسارات (تعديل خاص لـ Render) ---
// نستخدم مسار يسمح بالكتابة والقراءة بدون مشاكل صلاحيات
const DATA_DIR = path.join(__dirname, 'data');
const SUB_DIR = path.join(__dirname, 'subtitles');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(SUB_DIR)) fs.mkdirSync(SUB_DIR, { recursive: true });

const DB_FILE = path.join(DATA_DIR, 'db.json');
const HISTORY_FILE = path.join(DATA_DIR, 'history.json');

let db = [];
let history = [];

// تحميل البيانات بأمان
try {
    if (fs.existsSync(DB_FILE)) db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    if (fs.existsSync(HISTORY_FILE)) history = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
} catch (e) { console.log("Starting with fresh DB"); }

const saveData = () => {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
        fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
    } catch (e) { console.error("Save error:", e); }
};

// --- [2] إعدادات السيرفر والرفع ---
const upload = multer({ dest: 'subtitles/' });
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
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
    } catch (e) { console.error("Meta Update Error"); }
}

// --- [5] واجهة الـ Dashboard (التصميم الكامل) ---
const dashboardStyle = `
<style>
    body { background-color: #f3f4f6; color: #1f2937; font-family: 'Inter', -apple-system, sans-serif; margin: 0; direction: ltr; }
    .nav { background: #111827; color: white; padding: 12px 50px; display: flex; align-items: center; gap: 25px; }
    .container { max-width: 1100px; margin: 40px auto; padding: 0 20px; display: grid; grid-template-columns: 1.6fr 1fr; gap: 25px; }
    .card { background: white; border-radius: 8px; border: 1px solid #e5e7eb; box-shadow: 0 1px 3px rgba(0,0,0,0.1); overflow: hidden; margin-bottom: 20px; }
    .card-header { background: #f9fafb; padding: 15px 20px; border-bottom: 1px solid #e5e7eb; font-weight: 700; font-size: 14px; color: #4b5563; }
    .history-item { display: flex; padding: 12px; border-bottom: 1px solid #f3f4f6; position: relative; }
    .history-item img { width: 55px; height: 80px; object-fit: cover; border-radius: 4px; }
    .item-details { margin-left: 15px; flex-grow: 1; }
    .btn-main { display: block; width: 100%; background: #2563eb; color: white; text-align: center; padding: 10px; border-radius: 4px; text-decoration: none; font-weight: 700; border:none; cursor:pointer; }
    input, select { width: 100%; padding: 10px; margin: 10px 0; border: 1px solid #ddd; border-radius: 4px; }
</style>
`;

app.get('/', (req, res) => {
    let itemsHtml = history.map(h => `
        <div class="history-item">
            <img src="${h.poster}" onerror="this.src='https://via.placeholder.com/55x80'">
            <div class="item-details">
                <h3 style="margin:0; font-size:15px;">${h.name}</h3>
                <code style="font-size:10px; color:#6b7280;">ID: ${h.id}</code><br>
                <a href="/upload-page/${encodeURIComponent(h.id)}" style="color:#2563eb; font-size:12px; font-weight:600;">+ Upload Subtitle</a>
            </div>
        </div>
    `).join('');

    res.send(`
        <html><head><title>Community Subtitles</title>${dashboardStyle}</head>
        <body>
            <div class="nav"><b style="font-size:18px;">CC Community</b> <a href="/" style="color:white; text-decoration:none;">Dashboard</a></div>
            <div class="container">
                <div class="main-content">
                    <div class="card">
                        <div class="card-header">🚀 QUICK ADD (UPLOAD)</div>
                        <div style="padding:20px;">
                            <form action="/manual-add" method="POST">
                                <input name="id" placeholder="IMDb ID (e.g. tt1234567)" required>
                                <select name="type"><option value="movie">Movie</option><option value="series">Series</option></select>
                                <button type="submit" class="btn-main">Add Content</button>
                            </form>
                        </div>
                    </div>
                    <div class="card">
                        <div class="card-header">📂 SELECTED & RECENT ACTIVITY</div>
                        <div style="padding:10px;">${itemsHtml || '<p style="text-align:center;">No activity yet.</p>'}</div>
                    </div>
                </div>
                <div class="sidebar">
                    <div class="card">
                        <div class="card-header" style="background:#166534; color:white;">INSTALLATION</div>
                        <div style="padding:20px;">
                            <input readonly value="https://${req.get('host')}/manifest.json" onclick="this.select()">
                            <a href="stremio://${req.get('host')}/manifest.json" class="btn-main">Install Addon</a>
                        </div>
                    </div>
                </div>
            </div>
        </body></html>
    `);
});

// --- [6] المسارات التشغيلية ---
app.post('/manual-add', (req, res) => {
    const { id, type } = req.body;
    if (!history.find(h => h.id === id)) {
        history.unshift({ id, type, name: "Loading...", poster: "", time: "Now" });
        saveData();
    }
    updateMetaInBackground(type, id, id.split(':')[0]);
    res.redirect(`/upload-page/${encodeURIComponent(id)}`);
});

app.get('/upload-page/:id', (req, res) => {
    const item = history.find(h => h.id === req.params.id);
    res.send(`<html><head>${dashboardStyle}</head><body>
        <div class="card" style="max-width:500px; margin:100px auto;">
            <div class="card-header">Publish Subtitle</div>
            <div style="padding:20px;">
                <p>Target: <b>${item ? item.name : req.params.id}</b></p>
                <form action="/upload" method="POST" enctype="multipart/form-data">
                    <input type="hidden" name="imdbId" value="${req.params.id}">
                    <input type="file" name="subFile" accept=".srt" required>
                    <input type="text" name="label" placeholder="Subtitle Label (Arabic, English...)" required>
                    <button type="submit" class="btn-main">Upload & Publish</button>
                </form>
                <a href="/" style="display:block; text-align:center; margin-top:10px; color:#9ca3af;">Cancel</a>
            </div>
        </div></body></html>`);
});

app.post('/upload', upload.single('subFile'), (req, res) => {
    if (req.file) {
        db.push({ 
            id: req.body.imdbId, 
            url: `https://${req.get('host')}/download/${req.file.filename}`, 
            label: req.body.label,
            filename: req.file.filename
        });
        saveData();
    }
    res.redirect('/');
});

app.get('/manifest.json', (req, res) => res.json(manifest));
app.get('/subtitles/:type/:id/:extra?.json', (req, res) => {
    builder.getInterface().get('subtitles', req.params.type, req.params.id)
        .then(r => res.json(r)).catch(() => res.json({ subtitles: [] }));
});

// أهم سطرين لـ Render
app.listen(PORT, '0.0.0.0', () => {
    console.log(`System Online on port ${PORT}`);
});
