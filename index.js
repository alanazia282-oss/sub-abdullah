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

// --- [4] المحرك (يربط ستريميو بالموقع) ---
builder.defineSubtitlesHandler(async (args) => {
    const fullId = args.id;
    const cleanId = fullId.split(':')[0];

    // إذا اشتغلت الحلقة في ستريميو، تضاف فوراً للهستوري (Selected)
    let existingEntry = history.find(h => h.id === fullId);
    if (!existingEntry) {
        const newEntry = {
            id: fullId,
            name: "جاري جلب التفاصيل...", 
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
            if (res.data.meta) {
                const meta = res.data.meta;
                const parts = fullId.split(':');
                finalName = (type === 'series' && parts[1]) ? `${meta.name} S${parts[1]}E${parts[2]}` : meta.name;
                finalPoster = meta.poster;
            }
        }
        if (finalName) {
            history = history.map(h => h.id === fullId ? { ...h, name: finalName, poster: finalPoster } : h);
            saveData();
        }
    } catch (e) {}
}

// --- [5] واجهة المستخدم ---
const dashboardStyle = `
<style>
    body { background-color: #f3f4f6; color: #1f2937; font-family: 'Inter', sans-serif; margin: 0; direction: ltr; }
    .nav { background: #111827; color: white; padding: 12px 50px; display: flex; gap: 25px; }
    .container { max-width: 1100px; margin: 40px auto; padding: 0 20px; display: grid; grid-template-columns: 1.6fr 1fr; gap: 25px; }
    .card { background: white; border-radius: 8px; border: 1px solid #e5e7eb; box-shadow: 0 1px 3px rgba(0,0,0,0.1); margin-bottom: 20px; }
    .card-header { background: #f9fafb; padding: 15px; border-bottom: 1px solid #e5e7eb; font-weight: bold; }
    .history-item { display: flex; padding: 12px; border-bottom: 1px solid #f3f4f6; position: relative; }
    .history-item img { width: 55px; height: 80px; object-fit: cover; border-radius: 4px; }
    .item-details { margin-left: 15px; }
    .btn-upload { display: inline-block; margin-top: 8px; font-size: 12px; color: #2563eb; text-decoration: none; font-weight: 600; border: 1px solid #2563eb; padding: 3px 10px; border-radius: 4px; }
    .green-head { background: #166534; color: white; padding: 12px; font-weight: bold; }
    .blue-head { background: #0e7490; color: white; padding: 12px; font-weight: bold; }
    .sidebar-body { padding: 15px; }
    .stat-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #f3f4f6; }
    .stat-circle { background: #111827; color: white; width: 25px; height: 25px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; }
</style>
`;

app.get('/', (req, res) => {
    let itemsHtml = history.map(h => `
        <div class="history-item">
            <img src="${h.poster}">
            <div class="item-details">
                <span style="font-size:10px; background:#eab308; padding:2px 5px; border-radius:4px;">${h.type}</span>
                <h3 style="margin:5px 0; font-size:16px;">${h.name}</h3>
                <a href="/upload-page/${encodeURIComponent(h.id)}" class="btn-upload">+ Upload Subtitle</a>
            </div>
            <div style="position:absolute; right:15px; color:#9ca3af; font-size:11px;">${h.time}</div>
        </div>
    `).join('');

    res.send(`
        <html><head><title>Community Subtitles</title>${dashboardStyle}</head>
        <body>
            <div class="nav"><b>CC Community Subtitles</b> <a href="/" style="color:white; text-decoration:none;">Dashboard</a></div>
            <div class="container">
                <div>
                    <h1 style="font-size:24px;">Your Dashboard</h1>
                    <div class="card">
                        <div class="card-header">RECENT ACTIVITY (SELECTED)</div>
                        <div style="padding:10px;">${itemsHtml || 'شغل حلقة في ستريميو لتظهر هنا'}</div>
                    </div>
                </div>
                <div>
                    <div class="card">
                        <div class="green-head">Addon Installation</div>
                        <div class="sidebar-body">
                            <input style="width:100%; padding:8px;" readonly value="https://${req.get('host')}/manifest.json">
                            <a href="stremio://${req.get('host')}/manifest.json" style="display:block; background:#2563eb; color:white; text-align:center; padding:10px; margin-top:10px; text-decoration:none; border-radius:4px;">Install Addon</a>
                        </div>
                    </div>
                    <div class="card">
                        <div class="blue-head">Your Stats (حالة الرفع)</div>
                        <div class="sidebar-body">
                            <div class="stat-row"><span>Uploaded (المرفوعة)</span><span class="stat-circle">${db.length}</span></div>
                            <div class="stat-row"><span>Selected (الهستوري)</span><span class="stat-circle">${history.length}</span></div>
                            <a href="/admin" style="display:block; text-align:center; margin-top:10px; color:#6b7280; font-size:12px;">📂 Manage Uploads</a>
                        </div>
                    </div>
                </div>
            </div>
            <script>setTimeout(()=> location.reload(), 10000);</script>
        </body></html>
    `);
});

// صفحة الرفع الإضافية
app.get('/upload-page/:id', (req, res) => {
    const item = history.find(h => h.id === req.params.id);
    res.send(`<html><head>${dashboardStyle}</head><body style="padding:50px;">
        <div class="card" style="max-width:400px; margin:auto; padding:20px;">
            <h3>Upload for: ${item ? item.name : req.params.id}</h3>
            <form action="/upload" method="POST" enctype="multipart/form-data">
                <input type="hidden" name="imdbId" value="${req.params.id}">
                <input type="file" name="subFile" required><br><br>
                <input type="text" name="label" placeholder="Your Name / Label" style="width:100%; padding:8px;"><br><br>
                <button type="submit" style="width:100%; background:green; color:white; padding:10px; border:none; border-radius:4px;">Publish</button>
            </form>
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
    let list = db.map((s, i) => `<div class="stat-row"><span>${s.label} (${s.id})</span><a href="/delete/${i}" style="color:red;">Delete</a></div>`).join('');
    res.send(`<div style="padding:50px; font-family:sans-serif;"><h2>Manage</h2>${list}<br><a href="/">Back</a></div>`);
});

app.get('/delete/:index', (req, res) => {
    db.splice(req.params.index, 1);
    saveData();
    res.redirect('/admin');
});

app.get('/manifest.json', (req, res) => res.json(manifest));
app.get('/subtitles/:type/:id/:extra?.json', (req, res) => {
    builder.getInterface().get('subtitles', req.params.type, req.params.id).then(r => res.json(r));
});

app.listen(process.env.PORT || 3000, () => console.log("System Running..."));
