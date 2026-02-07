const express = require('express');
const { addonBuilder } = require('stremio-addon-sdk');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cors = require('cors');

const app = express();

// --- [1] إعدادات البيانات والمجلدات ---
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

const manifest = {
    id: "org.abdullah.hybrid.v12",
    version: "12.6.0",
    name: "Community Subtitles (Hybrid)",
    description: "Personal + Subsource.net API",
    resources: ["subtitles"],
    types: ["movie", "series", "anime"],
    idPrefixes: ["tt", "kitsu"],
    catalogs: [] 
};

const builder = new addonBuilder(manifest);

// --- [3] وظيفة جلب الترجمات من Subsource API ---
async function fetchFromSubsource(imdbId) {
    try {
        // نستخدم واجهة البحث البرمجية لـ Subsource لجلب الترجمات العربية
        const response = await axios.get(`https://api.subsource.net/api/getSubtitles/${imdbId}`, { timeout: 4000 });
        if (response.data && response.data.subtitles) {
            return response.data.subtitles
                .filter(s => s.lang === 'Arabic' || s.lang === 'ara')
                .map(s => ({
                    id: `subsource-${s.id}`,
                    url: s.downloadUrl,
                    lang: "ara",
                    label: `[Subsource] ${s.author || 'Translator'}`
                }));
        }
    } catch (e) {
        console.log("Subsource API error or no results.");
    }
    return [];
}

// --- [4] معالج طلبات ستريميو ---
builder.defineSubtitlesHandler(async (args) => {
    const fullId = args.id;
    const parts = fullId.split(':');
    const cleanId = parts[0];

    // 1. جلب ترجماتك الشخصية
    const mySubs = db.filter(s => s.id === fullId).map(s => ({
        id: s.url, url: s.url, lang: "ara", label: `[Local] ${s.label}`
    }));

    // 2. جلب ترجمات Subsource
    const subsourceSubs = await fetchFromSubsource(cleanId);

    // 3. إدارة السجل والميتا في الـ Dashboard
    let existingEntry = history.find(h => h.id === fullId);
    if (!existingEntry) {
        const newEntry = {
            id: fullId,
            name: cleanId, 
            poster: `https://images.metahub.space/poster/medium/${cleanId}/img`,
            type: args.type,
            time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
            subsCount: mySubs.length + subsourceSubs.length
        };
        history = [newEntry, ...history].slice(0, 25);
        saveData();
        updateMetaSmart(args.type, fullId, cleanId, parts);
    }

    return { subtitles: [...mySubs, ...subsourceSubs] };
});

async function updateMetaSmart(type, fullId, cleanId, parts) {
    try {
        const res = await axios.get(`https://v3-cinemeta.strem.io/meta/${type}/${cleanId}.json`);
        if (res.data && res.data.meta) {
            const meta = res.data.meta;
            let finalName = meta.name;
            let finalPoster = meta.poster;

            if (type === 'series' && parts.length >= 3) {
                const ep = meta.videos?.find(v => v.season == parts[1] && v.number == parts[2]);
                finalName = `${meta.name} - S${parts[1]}E${parts[2]} ${ep?.title ? `(${ep.title})` : ''}`;
                finalPoster = ep?.thumbnail || meta.poster;
            }
            history = history.map(h => h.id === fullId ? { ...h, name: finalName, poster: finalPoster } : h);
            saveData();
        }
    } catch (e) {}
}

// --- [5] واجهة الـ Dashboard (التصميم الكامل) ---
const dashboardStyle = `
<style>
    body { background: #f0f2f5; color: #1c1e21; font-family: 'Segoe UI', Tahoma, sans-serif; margin: 0; }
    .nav { background: #1877f2; color: white; padding: 15px 5%; display: flex; align-items: center; justify-content: space-between; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    .container { max-width: 1100px; margin: 30px auto; padding: 0 20px; display: grid; grid-template-columns: 2fr 1fr; gap: 25px; }
    .card { background: white; border-radius: 10px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); overflow: hidden; margin-bottom: 20px; }
    .card-header { padding: 15px; border-bottom: 1px solid #eee; font-weight: bold; background: #fafafa; }
    .episode-card { display: flex; padding: 15px; border-bottom: 1px solid #f0f2f5; transition: 0.2s; }
    .episode-card:hover { background: #f9f9f9; }
    .thumb { width: 130px; height: 85px; object-fit: cover; border-radius: 6px; background: #000; }
    .info { margin-left: 15px; flex-grow: 1; }
    .info h3 { margin: 0 0 5px 0; font-size: 16px; }
    .btn { background: #1877f2; color: white; text-decoration: none; padding: 6px 12px; border-radius: 6px; font-size: 12px; display: inline-block; margin-top: 8px; font-weight: 600; }
    .btn-del { color: #dc3545; font-size: 12px; text-decoration: none; margin-left: 10px; }
    .install-box { background: #f0f2f5; padding: 10px; border-radius: 5px; font-family: monospace; font-size: 11px; word-break: break-all; margin: 10px 0; border: 1px solid #ddd; }
</style>
`;

app.get('/', (req, res) => {
    let listHtml = history.map(h => `
        <div class="episode-card">
            <img class="thumb" src="${h.poster}" onerror="this.src='https://via.placeholder.com/130x85?text=No+Image'">
            <div class="info">
                <span style="font-size:10px; background: #e7f3ff; color: #1877f2; padding: 2px 5px; border-radius: 4px;">${h.type}</span>
                <h3>${h.name}</h3>
                <code style="font-size:10px; color:#888;">${h.id}</code><br>
                <a href="/upload-page/${encodeURIComponent(h.id)}" class="btn">Upload Subtitle</a>
                <span style="margin-left:10px; font-size:11px; color:#28a745;">✓ API Connected</span>
            </div>
            <div style="font-size:11px; color:#bbb;">${h.time}</div>
        </div>
    `).join('');

    res.send(`
        <html><head><title>Hybrid Dashboard</title>${dashboardStyle}</head>
        <body>
            <div class="nav"><div style="font-size:20px; font-weight:bold;">Community Subtitles Manager</div></div>
            <div class="container">
                <div>
                    <div class="card">
                        <div class="card-header">STREMIO ACTIVITY LOG</div>
                        ${listHtml || '<div style="padding:40px; text-align:center;">No activity found.</div>'}
                    </div>
                </div>
                <div>
                    <div class="card" style="padding:15px;">
                        <div style="font-weight:bold;">INSTALLATION</div>
                        <div class="install-box">https://${req.get('host')}/manifest.json</div>
                        <a href="stremio://${req.get('host')}/manifest.json" class="btn" style="width:100%; text-align:center; box-sizing:border-box;">Install Now</a>
                    </div>
                    <div class="card" style="padding:15px;">
                        <div style="font-weight:bold;">MY DATABASE</div>
                        <p style="font-size:13px;">Local Files: <b>${db.length}</b></p>
                        <a href="/admin" style="font-size:12px; color:#1877f2;">📂 Manage My Uploads</a>
                    </div>
                </div>
            </div>
        </body></html>
    `);
});

// --- [6] مسارات الرفع، الحذف، والإدارة ---
app.get('/upload-page/:id', (req, res) => {
    const item = history.find(h => h.id === req.params.id);
    res.send(`<html><head>${dashboardStyle}</head><body style="padding:50px; background:#f0f2f5;">
        <div class="card" style="max-width:450px; margin:0 auto; padding:25px;">
            <h3>Upload Arabic Subtitle</h3>
            <p style="font-size:13px; color:#666;">For: <b>${item ? item.name : req.params.id}</b></p>
            <form action="/upload" method="POST" enctype="multipart/form-data">
                <input type="hidden" name="imdbId" value="${req.params.id}">
                <input type="file" name="subFile" accept=".srt" required style="margin-bottom:15px;"><br>
                <input type="text" name="label" placeholder="Translator Name (e.g. Abdullah)" style="width:100%; padding:10px; border:1px solid #ddd; border-radius:6px; margin-bottom:20px;">
                <button type="submit" class="btn" style="width:100%; border:none; padding:12px; cursor:pointer; font-size:14px;">Publish to Community</button>
            </form>
            <a href="/" style="display:block; text-align:center; margin-top:15px; font-size:12px; color:#888; text-decoration:none;">← Cancel and Return</a>
        </div></body></html>`);
});

app.post('/upload', upload.single('subFile'), (req, res) => {
    if (req.file) {
        db.push({ 
            id: req.body.imdbId, 
            url: `https://${req.get('host')}/download/${req.file.filename}`, 
            label: req.body.label || "Personal Sub",
            filename: req.file.filename 
        });
        saveData();
    }
    res.redirect('/');
});

app.get('/admin', (req, res) => {
    let rows = db.map((s, i) => `
        <div style="display:flex; justify-content:space-between; padding:12px; border-bottom:1px solid #eee; font-size:13px;">
            <div><b>${s.label}</b> - <small>${s.id}</small></div>
            <a href="/delete/${i}" class="btn-del">Delete</a>
        </div>`).join('');
    res.send(`<html><head>${dashboardStyle}</head><body><div class="card" style="max-width:650px; margin:50px auto;">
        <div class="card-header">MANAGE MY UPLOADS</div>
        <div style="max-height:400px; overflow-y:auto;">${rows || '<p style="padding:20px;">No personal files yet.</p>'}</div>
        <div style="padding:15px; border-top:1px solid #eee;"><a href="/" class="btn">Back to Dashboard</a></div>
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

// --- [7] تفعيل الإضافة للمتصفح وستريميو ---
app.get('/manifest.json', (req, res) => res.json(manifest));
app.get('/subtitles/:type/:id/:extra?.json', (req, res) => {
    builder.getInterface().get('subtitles', req.params.type, req.params.id)
        .then(r => res.json(r)).catch(() => res.json({ subtitles: [] }));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 System Online at port ${PORT}`));
