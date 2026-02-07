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

// --- [2] الإعدادات العامة والرفع ---
const upload = multer({ dest: 'subtitles/' });
app.use(cors());
app.use(express.json());
app.use('/download', express.static('subtitles'));

const manifest = {
    id: "org.abdullah.ultimate.v12",
    version: "12.2.0",
    name: "Community Subtitles",
    description: "Full Feature Subtitle Manager",
    resources: ["subtitles"],
    types: ["movie", "series", "anime"],
    idPrefixes: ["tt", "kitsu"],
    catalogs: [] 
};

const builder = new addonBuilder(manifest);

// --- [3] معالج ستريميو (الخلفية الذكية) ---
builder.defineSubtitlesHandler(async (args) => {
    const fullId = args.id;
    const parts = fullId.split(':');
    const cleanId = parts[0];

    // إضافة للسجل فوراً ببيانات أولية لضمان عدم حدوث تعليق
    let existingEntry = history.find(h => h.id === fullId);
    if (!existingEntry) {
        let initialName = cleanId;
        if (parts.length >= 3) initialName = `${cleanId} (S${parts[1]} E${parts[2]})`;
        
        const newEntry = {
            id: fullId,
            name: initialName, 
            poster: `https://images.metahub.space/poster/medium/${cleanId}/img`,
            type: args.type,
            time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
            subsCount: db.filter(s => s.id === fullId).length
        };
        history = [newEntry, ...history].slice(0, 25);
        saveData();
    }

    // تحديث البيانات (الميتا) في الخلفية لرفع الدقة
    updateMetaDetailed(args.type, fullId, cleanId, parts);

    const foundSubs = db.filter(s => s.id === fullId).map(s => ({
        id: s.url, url: s.url, lang: "ara", label: s.label || "Abdullah Sub"
    }));

    return { subtitles: foundSubs };
});

async function updateMetaDetailed(type, fullId, cleanId, parts) {
    try {
        let finalName = "";
        let finalPoster = "";

        if (cleanId.startsWith('tt')) {
            const res = await axios.get(`https://v3-cinemeta.strem.io/meta/${type}/${cleanId}.json`, { timeout: 8000 });
            if (res.data && res.data.meta) {
                const meta = res.data.meta;
                if (type === 'series' && parts.length >= 3) {
                    const ep = meta.videos?.find(v => v.season == parts[1] && v.number == parts[2]);
                    finalName = `${meta.name} - S${parts[1]}E${parts[2]} ${ep?.title ? `(${ep.title})` : ''}`;
                    finalPoster = ep?.thumbnail || meta.poster;
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
                finalName = parts[2] ? `${attr.canonicalTitle} - EP ${parts[2]}` : attr.canonicalTitle;
                finalPoster = attr.posterImage?.medium || attr.posterImage?.original;
            }
        }

        if (finalName) {
            const currentSubs = db.filter(s => s.id === fullId).length;
            history = history.map(h => h.id === fullId ? { ...h, name: finalName, poster: finalPoster || h.poster, subsCount: currentSubs } : h);
            saveData();
        }
    } catch (e) { console.log("Background Meta Update Skip"); }
}

// --- [4] التصميم والواجهة (Dashboard) ---
const dashboardStyle = `
<style>
    body { background: #f0f2f5; color: #1c1e21; font-family: 'Segoe UI', Tahoma, sans-serif; margin: 0; direction: ltr; }
    .nav { background: #1877f2; color: white; padding: 15px 5%; display: flex; align-items: center; justify-content: space-between; }
    .container { max-width: 1100px; margin: 30px auto; padding: 0 20px; display: grid; grid-template-columns: 2fr 1fr; gap: 25px; }
    .card { background: white; border-radius: 10px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); overflow: hidden; margin-bottom: 20px; }
    .card-header { padding: 15px; border-bottom: 1px solid #eee; font-weight: bold; background: #fafafa; }
    .episode-card { display: flex; padding: 15px; border-bottom: 1px solid #f0f2f5; position: relative; }
    .thumb { width: 130px; height: 80px; object-fit: cover; border-radius: 6px; background: #eee; }
    .info { margin-left: 15px; flex-grow: 1; }
    .info h3 { margin: 0 0 5px 0; font-size: 15px; }
    .badge { font-size: 10px; background: #e7f3ff; color: #1877f2; padding: 2px 6px; border-radius: 4px; font-weight: bold; }
    .btn { background: #1877f2; color: white; text-decoration: none; padding: 6px 12px; border-radius: 6px; font-size: 12px; display: inline-block; margin-top: 8px; }
    .subs-count { font-size: 11px; color: #28a745; font-weight: bold; margin-left: 10px; }
    .install-box { background: #f0f2f5; padding: 10px; border-radius: 5px; font-family: monospace; font-size: 11px; word-break: break-all; margin: 10px 0; }
</style>
`;

app.get('/', (req, res) => {
    let listHtml = history.map(h => `
        <div class="episode-card">
            <img class="thumb" src="${h.poster}" onerror="this.src='https://via.placeholder.com/130x80?text=No+Image'">
            <div class="info">
                <span class="badge">${h.type}</span>
                <h3>${h.name}</h3>
                <code style="font-size:10px; color:#888;">${h.id}</code><br>
                <a href="/upload-page/${encodeURIComponent(h.id)}" class="btn">+ Upload Arabic Sub</a>
                <span class="subs-count">${h.subsCount || 0} SUB(S)</span>
            </div>
            <div style="font-size:11px; color:#bbb;">${h.time}</div>
        </div>
    `).join('');

    res.send(`
        <html><head><title>Addon Dashboard</title>${dashboardStyle}</head>
        <body>
            <div class="nav"><div style="font-size:18px; font-weight:bold;">Community Subtitles v12</div></div>
            <div class="container">
                <div>
                    <div class="card">
                        <div class="card-header">RECENT ACTIVITY</div>
                        ${listHtml || '<div style="padding:40px; text-align:center;">No activity. Open Stremio and play something.</div>'}
                    </div>
                </div>
                <div>
                    <div class="card" style="padding:15px;">
                        <div style="font-weight:bold;">INSTALLATION</div>
                        <div class="install-box">https://${req.get('host')}/manifest.json</div>
                        <a href="stremio://${req.get('host')}/manifest.json" class="btn" style="width:100%; text-align:center; box-sizing:border-box;">Install to Stremio</a>
                    </div>
                    <div class="card" style="padding:15px;">
                        <div style="font-weight:bold;">DATABASE</div>
                        <div style="padding:10px 0; font-size:14px; border-bottom:1px solid #eee; display:flex; justify-content:space-between;">
                            <span>Total Subs:</span><b>${db.length}</b>
                        </div>
                        <a href="/admin" style="display:block; margin-top:10px; font-size:12px; color:#1877f2; text-decoration:none;">📂 Manage Uploaded Files</a>
                    </div>
                </div>
            </div>
            <script>setTimeout(()=>location.reload(), 10000);</script>
        </body></html>
    `);
});

// --- [5] مسارات الرفع والإدارة (Admin & Upload) ---
app.get('/upload-page/:id', (req, res) => {
    const item = history.find(h => h.id === req.params.id);
    res.send(`<html><head>${dashboardStyle}</head><body style="padding:50px;">
        <div class="card" style="max-width:450px; margin:0 auto; padding:20px;">
            <h3>Upload Subtitle</h3>
            <p style="font-size:13px; color:#666;">Target: <b>${item ? item.name : req.params.id}</b></p>
            <form action="/upload" method="POST" enctype="multipart/form-data">
                <input type="hidden" name="imdbId" value="${req.params.id}">
                <input type="file" name="subFile" accept=".srt" required style="margin-bottom:15px;"><br>
                <input type="text" name="label" placeholder="Translator / Label (e.g. Abdullah)" style="width:100%; padding:10px; border:1px solid #ddd; border-radius:6px; margin-bottom:15px;">
                <button type="submit" class="btn" style="width:100%; border:none; padding:12px; cursor:pointer;">Publish Now</button>
            </form>
            <a href="/" style="display:block; text-align:center; margin-top:15px; font-size:12px; color:#888;">Back to Dashboard</a>
        </div></body></html>`);
});

app.post('/upload', upload.single('subFile'), (req, res) => {
    if (req.file) {
        db.push({ 
            id: req.body.imdbId, 
            url: `https://${req.get('host')}/download/${req.file.filename}`, 
            label: req.body.label || "Arabic Sub",
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
            <a href="/delete/${i}" style="color:red; text-decoration:none;">Delete</a>
        </div>`).join('');
    res.send(`<html><head>${dashboardStyle}</head><body><div class="card" style="max-width:600px; margin:50px auto;">
        <div class="card-header">MANAGE FILES</div>${rows || '<p style="padding:20px;">No files found.</p>'}
        <div style="padding:15px;"><a href="/" class="btn">Back</a></div>
    </div></body></html>`);
});

app.get('/delete/:index', (req, res) => {
    const item = db[req.params.index];
    if (item && item.filename) { try { fs.unlinkSync(path.join(SUB_DIR, item.filename)); } catch(e) {} }
    db.splice(req.params.index, 1);
    saveData();
    res.redirect('/admin');
});

// --- [6] تفعيل الـ Addon ---
app.get('/manifest.json', (req, res) => res.json(manifest));
app.get('/subtitles/:type/:id/:extra?.json', (req, res) => {
    builder.getInterface().get('subtitles', req.params.type, req.params.id)
        .then(r => res.json(r)).catch(() => res.json({ subtitles: [] }));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
