const express = require('express');
const { addonBuilder } = require('stremio-addon-sdk');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cors = require('cors');

const app = express();

// --- [1] إعدادات المجلدات والبيانات ---
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

// --- [3] Stremio Manifest (مع تصحيح المصفوفة) ---
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
            const res = await axios.get(`https://v3-cinemeta.strem.io/meta/${type}/${cleanId}.json`);
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
        }
        if (finalName) {
            history = history.map(h => h.id === fullId ? { ...h, name: finalName, poster: finalPoster } : h);
            saveData();
        }
    } catch (e) { console.error("Meta Error"); }
}

// --- [5] واجهة المستخدم الكاملة (CSS) ---
const dashboardStyle = `
<style>
    body { background-color: #f3f4f6; color: #1f2937; font-family: 'Segoe UI', sans-serif; margin: 0; padding: 0; }
    .nav { background: #111827; color: white; padding: 12px 50px; display: flex; align-items: center; gap: 20px; }
    .nav a { color: #9ca3af; text-decoration: none; font-size: 14px; }
    .container { max-width: 1100px; margin: 30px auto; padding: 0 20px; display: grid; grid-template-columns: 300px 1fr; gap: 20px; }
    
    /* القوائم والبطاقات */
    .card { background: white; border-radius: 4px; border: 1px solid #e5e7eb; overflow: hidden; margin-bottom: 20px; }
    .card-header { background: #f9fafb; padding: 10px 15px; border-bottom: 1px solid #e5e7eb; font-weight: bold; font-size: 14px; }
    .blue-header { background: #2563eb; color: white; padding: 10px 15px; font-weight: bold; }
    
    .section-box { background: white; border: 1px solid #e5e7eb; border-radius: 4px; margin-bottom: 10px; }
    .section-header { background: #f9fafb; padding: 12px; cursor: pointer; display: flex; justify-content: space-between; font-size: 13px; font-weight: 600; }
    .section-body { padding: 15px; display: none; } /* مخفي افتراضياً */
    .section-body.active { display: block; }

    .sub-item-blue { background: #5bc0de; color: white; border-radius: 4px; padding: 12px; margin-bottom: 10px; }
    .btn-main { background: #5cb85c; color: white; padding: 8px 15px; border-radius: 4px; text-decoration: none; display: inline-block; font-size: 12px; border:none; cursor:pointer; }
    
    /* الهيستوري */
    .history-item { display: flex; padding: 10px; border-bottom: 1px solid #f3f4f6; text-decoration: none; color: inherit; }
    .history-item:hover { background: #f8fafc; }
    .history-item img { width: 50px; height: 70px; object-fit: cover; border-radius: 4px; }
</style>
`;

// --- [6] المسارات (Routes) ---

// 1. الصفحة الرئيسية
app.get('/', (req, res) => {
    let itemsHtml = history.map(h => `
        <a href="/content/${encodeURIComponent(h.id)}" class="history-item">
            <img src="${h.poster}">
            <div style="margin-left:15px;">
                <div style="font-weight:bold;">${h.name}</div>
                <div style="font-size:11px; color:#6b7280;">ID: ${h.id}</div>
            </div>
        </a>
    `).join('');

    res.send(`<html><head>${dashboardStyle}</head><body>
        <div class="nav"><b>CC Community Subtitles</b><a href="/">Dashboard</a></div>
        <div class="container" style="grid-template-columns: 1fr 300px;">
            <div class="card"><div class="card-header">Recent Activity</div>${itemsHtml || '<p style="padding:20px">No activity</p>'}</div>
            <div class="card"><div class="blue-header">Installation</div><div style="padding:15px"><a href="stremio://${req.get('host')}/manifest.json" class="btn-main" style="width:100%; text-align:center;">Install Addon</a></div></div>
        </div>
    </body></html>`);
});

// 2. صفحة العمل التفصيلية (Content Page)
app.get('/content/:id', (req, res) => {
    const item = history.find(h => h.id === req.params.id) || { id: req.params.id, name: "Loading...", poster: "" };
    const subs = db.filter(s => s.id === req.params.id);

    res.send(`
        <html><head>${dashboardStyle}</head><body>
            <div class="nav"><b>CC Community Subtitles</b><a href="/">Dashboard</a></div>
            <div class="container">
                <div class="sidebar">
                    <div class="card">
                        <img src="${item.poster}" style="width:100%">
                        <div class="blue-header">Information</div>
                        <div style="padding:10px; font-size:12px;"><b>ID:</b> ${item.id}<br><b>Type:</b> ${item.type}</div>
                    </div>
                </div>
                <div class="main">
                    <div style="background:#111827; color:white; padding:20px; border-radius:4px; margin-bottom:20px;">
                        <h1 style="margin:0; font-size:20px;">${item.name}</h1>
                    </div>
                    
                    <div class="section-box">
                        <div class="section-header" onclick="toggleSec('community')"><span>Community Subtitles</span><span>▼</span></div>
                        <div id="community" class="section-body active">
                            <a href="/upload-page/${encodeURIComponent(item.id)}" class="btn-main" style="float:right;">+ Upload</a>
                            <div style="clear:both; margin-top:10px;"></div>
                            ${subs.map(s => `
                                <div class="sub-item-blue">
                                    <b>[${s.label}] Arabic Subtitle</b><br>
                                    <a href="${s.url}" style="color:white; font-size:11px;">Download File</a>
                                </div>
                            `).join('') || 'No subtitles yet.'}
                        </div>
                    </div>

                    <div class="section-box">
                        <div class="section-header" onclick="toggleSec('general')"><span>General Subtitles (No Hash)</span><span>▼</span></div>
                        <div id="general" class="section-body">Searching for general results...</div>
                    </div>
                </div>
            </div>
            <script>function toggleSec(id){ document.getElementById(id).classList.toggle('active'); }</script>
        </body></html>
    `);
});

// 3. صفحة الرفع
app.get('/upload-page/:id', (req, res) => {
    res.send(`<html><head>${dashboardStyle}</head><body>
        <div class="card" style="max-width:400px; margin:50px auto; padding:20px;">
            <h3>Upload for ${req.params.id}</h3>
            <form action="/upload" method="POST" enctype="multipart/form-data">
                <input type="hidden" name="imdbId" value="${req.params.id}">
                <input type="file" name="subFile" required><br><br>
                <input type="text" name="label" placeholder="Your Name/Label" style="width:100%; padding:8px;"><br><br>
                <button type="submit" class="btn-main">Publish</button>
            </form>
        </div>
    </body></html>`);
});

app.post('/upload', upload.single('subFile'), (req, res) => {
    if (req.file) {
        db.push({ id: req.body.imdbId, url: `https://${req.get('host')}/download/${req.file.filename}`, label: req.body.label, filename: req.file.filename });
        saveData();
    }
    res.redirect('/content/' + encodeURIComponent(req.body.imdbId));
});

// 4. المانيفست والـ API
app.get('/manifest.json', (req, res) => res.json(manifest));
app.get('/subtitles/:type/:id/:extra?.json', (req, res) => {
    builder.getInterface().get('subtitles', req.params.type, req.params.id)
        .then(r => res.json(r)).catch(() => res.json({ subtitles: [] }));
});

app.listen(3000, () => console.log('Full System Ready on port 3000'));
