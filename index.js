const express = require('express');
const { addonBuilder } = require('stremio-addon-sdk');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cors = require('cors');

const app = express();

// --- [1] الإعدادات الأساسية ---
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

const upload = multer({ dest: 'subtitles/' });
app.use(cors());
app.use(express.json());
app.use('/download', express.static('subtitles'));

// --- [2] المانيفست ---
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

// --- [3] التصميم (CSS) المحاكي للصور ---
const dashboardStyle = `
<style>
    :root { --blue-main: #2563eb; --bg-gray: #f3f4f6; --dark-navy: #111827; }
    body { background-color: var(--bg-gray); color: #1f2937; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 0; direction: ltr; }
    
    /* Navbar */
    .nav { background: var(--dark-navy); color: white; padding: 10px 50px; display: flex; align-items: center; justify-content: space-between; }
    .nav-links { display: flex; gap: 20px; align-items: center; }
    .nav a { color: #9ca3af; text-decoration: none; font-size: 13px; }
    .nav a.active { color: white; font-weight: bold; }

    .container { max-width: 1200px; margin: 30px auto; padding: 0 20px; display: grid; grid-template-columns: 300px 1fr; gap: 20px; }
    
    /* Left Sidebar Card */
    .poster-card { background: white; border-radius: 4px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .poster-card img { width: 100%; display: block; }
    .content-info-header { background: #2563eb; color: white; padding: 10px 15px; font-weight: bold; font-size: 14px; }
    .info-row { padding: 10px 15px; border-bottom: 1px solid #f3f4f6; font-size: 12px; display: flex; flex-direction: column; gap: 4px; }
    .info-label { font-weight: bold; color: #4b5563; }

    /* Right Side - Lists */
    .header-banner { background: var(--dark-navy); color: white; padding: 15px 20px; border-radius: 4px; margin-bottom: 20px; }
    .header-banner h1 { margin: 0; font-size: 18px; }

    .section-box { background: #fff; border: 1px solid #e5e7eb; border-radius: 6px; margin-bottom: 15px; }
    .section-header { background: #f9fafb; padding: 12px 15px; font-size: 13px; font-weight: 600; border-bottom: 1px solid #e5e7eb; display: flex; justify-content: space-between; align-items: center; cursor: pointer; }
    .section-body { padding: 15px; }

    /* Subtitle Item Style (Blue Cards) */
    .sub-item-blue { background: #5bc0de; color: white; border-radius: 4px; padding: 12px; margin-bottom: 10px; position: relative; }
    .sub-item-gray { background: #f9fafb; border: 1px solid #ddd; border-radius: 4px; padding: 12px; margin-bottom: 10px; }
    .sub-title { font-weight: bold; font-size: 13px; margin-bottom: 5px; display: block; }
    .sub-meta { font-size: 11px; opacity: 0.9; }
    
    .btn-action { background: #5cb85c; color: white; border: none; padding: 5px 10px; border-radius: 4px; font-size: 11px; cursor: pointer; text-decoration: none; }
    .btn-upload-new { background: #5cb85c; color: white; padding: 6px 12px; border-radius: 4px; text-decoration: none; font-size: 12px; float: right; }
    
    /* Utility */
    .badge-ara { background: #374151; color: white; padding: 1px 5px; border-radius: 3px; font-size: 10px; }
</style>
`;

// --- [4] صفحة تفاصيل العمل (المحاكاة للصورة الثانية) ---
app.get('/content/:id', (req, res) => {
    const item = history.find(h => h.id === req.params.id) || { id: req.params.id, name: "Unknown Content", poster: "" };
    const subs = db.filter(s => s.id === req.params.id);

    res.send(`
        <html><head><title>${item.name}</title>${dashboardStyle}</head>
        <body>
            <div class="nav">
                <div class="nav-links">
                    <span style="font-weight:900;">CC Community Subtitles</span>
                    <a href="/">Dashboard</a>
                    <a href="#">Install Addon</a>
                </div>
            </div>

            <div class="container">
                <div class="left-col">
                    <div class="poster-card">
                        <img src="${item.poster || 'https://via.placeholder.com/300x450'}">
                        <div class="content-info-header">Content Information</div>
                        <div class="info-row"><span class="info-label">Type:</span> <span class="badge-ara" style="background:#eab308; width:fit-content;">${item.type || 'N/A'}</span></div>
                        <div class="info-row"><span class="info-label">ID:</span> ${item.id}</div>
                        <div class="info-row"><span class="info-label">Year:</span> 2026</div>
                    </div>
                </div>

                <div class="right-col">
                    <div class="header-banner">
                        <h1>${item.name}</h1>
                    </div>

                    <div class="section-box">
                        <div class="section-header">
                            <span>Community Subtitles</span>
                            <a href="/upload-page/${encodeURIComponent(item.id)}" class="btn-upload-new">+ Upload New</a>
                        </div>
                        <div class="section-body">
                            <small style="color:#666; margin-bottom:10px; display:block;">Currently Selected (Arabic)</small>
                            ${subs.length > 0 ? subs.map(s => `
                                <div class="sub-item-blue">
                                    <span class="sub-title">[${s.label}] ${item.name} <span class="badge-ara">Arabic</span></span>
                                    <span class="sub-meta">Uploader: Abdullah | Added: 2026-02-07</span>
                                    <div style="margin-top:10px;">
                                        <a href="${s.url}" class="btn-action" style="background:#fff; color:#333;">Link</a>
                                        <a href="${s.url}" class="btn-action" style="background:#fff; color:#333;">Download</a>
                                    </div>
                                </div>
                            `).join('') : '<p style="font-size:12px; color:#999;">No subtitles uploaded by community yet.</p>'}
                        </div>
                    </div>

                    <div class="section-box">
                        <div class="section-header" onclick="alert('Open General Subtitles')">
                            <span>General Subtitles (No Hash, Arabic)</span>
                            <span>▼</span>
                        </div>
                    </div>

                    <div class="section-box">
                        <div class="section-header" onclick="alert('Open Provider Results')">
                            <span>Provider Results</span>
                            <span>▼</span>
                        </div>
                        <div class="section-body" style="text-align:center; color:#999; font-size:12px;">
                            No subtitles found from providers.
                        </div>
                    </div>
                </div>
            </div>
        </body></html>
    `);
});

// --- [5] الصفحة الرئيسية والرفع (محدثة لتدعم الدخول للعمل) ---
app.get('/', (req, res) => {
    let itemsHtml = history.map(h => `
        <div class="history-item" style="display:flex; background:white; padding:10px; margin-bottom:10px; border-radius:4px; border:1px solid #ddd; cursor:pointer;" onclick="location.href='/content/${encodeURIComponent(h.id)}'">
            <img src="${h.poster}" style="width:50px; height:70px; object-fit:cover; border-radius:4px;">
            <div style="margin-left:15px; flex-grow:1;">
                <div style="font-weight:bold; font-size:14px;">${h.name}</div>
                <div style="font-size:11px; color:#666;">ID: ${h.id}</div>
                <div style="margin-top:5px;"><span class="badge-ara" style="background:#eab308;">${h.type}</span></div>
            </div>
            <div style="font-size:11px; color:#999;">${h.time}</div>
        </div>
    `).join('');

    res.send(`<html><head>${dashboardStyle}</head><body>
        <div class="nav"><div class="nav-links"><span style="font-weight:900;">CC Community Subtitles</span><a href="/" class="active">Dashboard</a></div></div>
        <div class="container" style="grid-template-columns: 1fr 300px;">
            <div>
                <h2>Recent Activity</h2>
                ${itemsHtml || '<p>No activity yet.</p>'}
            </div>
            <div class="sidebar">
                <div class="content-info-header" style="background:#166534">Addon Installation</div>
                <div style="background:white; padding:15px; border:1px solid #ddd; margin-bottom:20px;">
                    <a href="stremio://${req.get('host')}/manifest.json" class="btn-action" style="display:block; text-align:center; background:#2563eb; padding:10px;">Install Addon</a>
                </div>
            </div>
        </div>
    </body></html>`);
});

// دالة الرفع (كما هي في كودك)
app.get('/upload-page/:id', (req, res) => {
    res.send(`<html><head>${dashboardStyle}</head><body>
        <div style="max-width:400px; margin:50px auto; background:white; padding:20px; border-radius:8px;">
            <h3>Upload Subtitle</h3>
            <form action="/upload" method="POST" enctype="multipart/form-data">
                <input type="hidden" name="imdbId" value="${req.params.id}">
                <input type="file" name="subFile" required style="margin-bottom:10px; display:block;">
                <input type="text" name="label" placeholder="Subtitle Label" style="width:100%; padding:8px; margin-bottom:10px;">
                <button type="submit" class="btn-action" style="width:100%; padding:10px;">Upload</button>
            </form>
        </div>
    </body></html>`);
});

app.post('/upload', upload.single('subFile'), (req, res) => {
    if (req.file) {
        db.push({ 
            id: req.body.imdbId, 
            url: `https://${req.get('host')}/download/${req.file.filename}`, 
            label: req.body.label || "User Sub",
            filename: req.file.filename
        });
        saveData();
    }
    res.redirect('/content/' + encodeURIComponent(req.body.imdbId));
});

// باقي تشغيل السيرفر...
app.get('/manifest.json', (req, res) => res.json(manifest));
app.listen(3000, () => console.log('Server running on 3000'));
