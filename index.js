const express = require('express');
const { addonBuilder } = require('stremio-addon-sdk');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cors = require('cors');

const app = express();

// --- [1] قاعدة البيانات والمجلدات ---
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

// --- [2] الإعدادات العامة ---
const upload = multer({ dest: 'subtitles/' });
app.use(cors());
app.use(express.json());
app.use('/download', express.static('subtitles'));

const manifest = {
    id: "org.abdullah.ultimate.v12",
    version: "12.0.0",
    name: "Community Subtitles",
    description: "Official Community Style Subtitle Manager",
    resources: ["subtitles"],
    types: ["movie", "series", "anime"],
    idPrefixes: ["tt", "kitsu"],
    catalogs: [] // ممنوع الحذف أو التعديل كما طلبت
};

const builder = new addonBuilder(manifest);

// --- [3] معالج الطلبات (الخلفية) ---
builder.defineSubtitlesHandler(async (args) => {
    const fullId = args.id;
    const cleanId = fullId.split(':')[0];

    // إضافة للسجل فوراً ببيانات مؤقتة لضمان السرعة
    let existingEntry = history.find(h => h.id === fullId);
    if (!existingEntry) {
        const newEntry = {
            id: fullId,
            name: "جاري جلب تفاصيل الحلقة...", 
            poster: `https://images.metahub.space/poster/medium/${cleanId}/img`,
            type: args.type,
            time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
            subsCount: 0
        };
        history = [newEntry, ...history].slice(0, 25);
        saveData();
    }

    // تحديث البيانات في الخلفية (اسم الحلقة + الصورة الحقيقية)
    updateMetaSmart(args.type, fullId, cleanId);

    const foundSubs = db.filter(s => s.id === fullId).map(s => ({
        id: s.url, url: s.url, lang: "ara", label: s.label || "Abdullah Sub"
    }));

    return { subtitles: foundSubs };
});

// وظيفة جلب الميتا الذكية (تصليح مشكلة اسم الحلقة والصورة)
async function updateMetaSmart(type, fullId, cleanId) {
    try {
        let finalName = "";
        let finalPoster = "";
        const parts = fullId.split(':');

        if (cleanId.startsWith('tt')) {
            const res = await axios.get(`https://v3-cinemeta.strem.io/meta/${type}/${cleanId}.json`, { timeout: 7000 });
            if (res.data && res.data.meta) {
                const meta = res.data.meta;
                
                if (type === 'series' && parts.length >= 3) {
                    const ep = meta.videos?.find(v => v.season == parts[1] && v.number == parts[2]);
                    // جلب اسم المسلسل + الموسم والحلقة + عنوان الحلقة إن وجد
                    finalName = `${meta.name} - S${parts[1]}E${parts[2]} ${ep?.title ? `(${ep.title})` : ''}`;
                    // جلب صورة الحلقة (Thumbnail) وإذا لم توجد نستخدم بوستر المسلسل
                    finalPoster = ep?.thumbnail || meta.poster || `https://images.metahub.space/poster/medium/${cleanId}/img`;
                } else {
                    finalName = meta.name;
                    finalPoster = meta.poster;
                }
            }
        } else if (cleanId.startsWith('kitsu')) {
            const kitsuId = cleanId.split(':')[1];
            const kRes = await axios.get(`https://kitsu.io/api/edge/anime/${kitsuId}`, { timeout: 7000 });
            if (kRes.data && kRes.data.data) {
                const attr = kRes.data.data.attributes;
                const epNum = parts[1] || "";
                finalName = epNum ? `${attr.canonicalTitle} - EP ${epNum}` : attr.canonicalTitle;
                finalPoster = attr.posterImage?.medium || attr.posterImage?.original;
            }
        }

        if (finalName) {
            const count = db.filter(s => s.id === fullId).length;
            history = history.map(h => h.id === fullId ? { ...h, name: finalName, poster: finalPoster, subsCount: count } : h);
            saveData();
        }
    } catch (e) {
        console.log("Meta Update Background Task: Small delay or server busy.");
    }
}

// --- [4] واجهة المستخدم (التصميم الجديد) ---
const dashboardStyle = `
<style>
    body { background: #f0f2f5; color: #1c1e21; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; direction: ltr; }
    .nav { background: #1877f2; color: white; padding: 15px 5%; display: flex; align-items: center; justify-content: space-between; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    .container { max-width: 1200px; margin: 30px auto; padding: 0 20px; display: grid; grid-template-columns: 2fr 1fr; gap: 30px; }
    .card { background: white; border-radius: 12px; box-shadow: 0 2px 12px rgba(0,0,0,0.08); overflow: hidden; margin-bottom: 20px; }
    .card-header { padding: 15px 20px; border-bottom: 1px solid #e5e7eb; background: #fff; font-weight: bold; color: #4b5563; }
    .episode-card { display: flex; padding: 15px; border-bottom: 1px solid #f0f2f5; transition: 0.3s; position: relative; }
    .episode-card:hover { background: #f9fafb; }
    .thumb-container { position: relative; width: 140px; height: 80px; flex-shrink: 0; }
    .thumb-container img { width: 100%; height: 100%; object-fit: cover; border-radius: 8px; background: #000; }
    .subs-badge { position: absolute; bottom: 5px; right: 5px; background: rgba(0,0,0,0.7); color: #00ff00; font-size: 10px; padding: 2px 6px; border-radius: 4px; font-weight: bold; }
    .episode-info { margin-left: 20px; flex-grow: 1; }
    .episode-info h3 { margin: 0 0 5px 0; font-size: 16px; color: #1c1e21; }
    .episode-info p { margin: 0; font-size: 12px; color: #65676b; }
    .type-tag { font-size: 10px; background: #e7f3ff; color: #1877f2; padding: 2px 8px; border-radius: 10px; font-weight: bold; text-transform: uppercase; }
    .btn-upload { background: #1877f2; color: white; text-decoration: none; padding: 6px 12px; border-radius: 6px; font-size: 12px; font-weight: 600; display: inline-block; margin-top: 10px; }
    .btn-upload:hover { background: #166fe5; }
    .sidebar-card { padding: 20px; }
    .install-box { background: #f0f2f5; padding: 10px; border-radius: 6px; font-family: monospace; font-size: 11px; word-break: break-all; margin: 10px 0; }
</style>
`;

app.get('/', (req, res) => {
    let listHtml = history.map(h => `
        <div class="episode-card">
            <div class="thumb-container">
                <img src="${h.poster}" onerror="this.src='https://via.placeholder.com/140x80?text=No+Image'">
                <div class="subs-badge">${h.subsCount || 0} SUBS</div>
            </div>
            <div class="episode-info">
                <span class="type-tag">${h.type}</span>
                <h3>${h.name}</h3>
                <p>ID: ${h.id} • ${h.time}</p>
                <a href="/upload-page/${encodeURIComponent(h.id)}" class="btn-upload">Upload Arabic Subtitle</a>
            </div>
        </div>
    `).join('');

    res.send(`
        <html><head><title>Subtitle Dashboard</title>${dashboardStyle}</head>
        <body>
            <div class="nav">
                <div style="font-size:20px; font-weight:bold;">🎬 Subtitle Manager</div>
                <div style="font-size:14px;">Server Active ✅</div>
            </div>
            <div class="container">
                <div>
                    <div class="card">
                        <div class="card-header">RECENTLY WATCHED IN STREMIO</div>
                        ${listHtml || '<div style="padding:40px; text-align:center; color:#65676b;">No activity detected. Open Stremio and play a video.</div>'}
                    </div>
                </div>
                <div>
                    <div class="card sidebar-card">
                        <div style="font-weight:bold; margin-bottom:10px;">INSTALLATION</div>
                        <p style="font-size:13px; color:#65676b;">Copy this link into Stremio search bar:</p>
                        <div class="install-box">https://${req.get('host')}/manifest.json</div>
                        <a href="stremio://${req.get('host')}/manifest.json" class="btn-upload" style="width:100%; text-align:center; box-sizing:border-box;">One-Click Install</a>
                    </div>
                    <div class="card sidebar-card">
                        <div style="font-weight:bold; margin-bottom:10px;">MY STATISTICS</div>
                        <div style="display:flex; justify-content:space-between; font-size:14px; padding:8px 0; border-bottom:1px solid #f0f2f5;">
                            <span>Total Uploads</span><b>${db.length}</b>
                        </div>
                        <a href="/admin" style="display:block; margin-top:15px; font-size:12px; color:#1877f2; text-decoration:none;">📂 Manage My Files</a>
                    </div>
                </div>
            </div>
            <script>setTimeout(()=> { if(location.pathname==='/') location.reload(); }, 6000);</script>
        </body></html>
    `);
});

// --- [5] مسارات الرفع والإدارة (باقية كما هي لضمان عملها) ---
app.get('/upload-page/:id', (req, res) => {
    const item = history.find(h => h.id === req.params.id);
    res.send(`<html><head>${dashboardStyle}</head><body>
        <div class="card" style="max-width:500px; margin:80px auto; padding:25px;">
            <h2 style="margin-top:0;">Upload Subtitle</h2>
            <p style="font-size:14px; color:#65676b;">For: <br><b>${item ? item.name : req.params.id}</b></p>
            <form action="/upload" method="POST" enctype="multipart/form-data">
                <input type="hidden" name="imdbId" value="${req.params.id}">
                <div style="margin:20px 0;">
                    <label style="display:block; font-size:12px; margin-bottom:5px;">Select .SRT File:</label>
                    <input type="file" name="subFile" accept=".srt" required>
                </div>
                <input type="text" name="label" placeholder="Translator Name / Label" style="width:100%; padding:10px; border:1px solid #ddd; border-radius:6px; margin-bottom:20px;">
                <button type="submit" class="btn-upload" style="width:100%; padding:12px; border:none; cursor:pointer; font-size:14px;">Publish Subtitle</button>
            </form>
            <a href="/" style="display:block; text-align:center; margin-top:15px; color:#65676b; text-decoration:none; font-size:13px;">← Back to Dashboard</a>
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
        <div style="display:flex; justify-content:space-between; padding:10px; border-bottom:1px solid #eee;">
            <div style="font-size:13px;"><b>${s.label}</b><br><small style="color:#888;">${s.id}</small></div>
            <a href="/delete/${i}" style="color:red; text-decoration:none; font-size:12px;">Delete</a>
        </div>`).join('');
    res.send(`<div style="max-width:600px; margin:50px auto; font-family:sans-serif;">
        <h3>Manage Uploaded Files</h3>${rows || 'No files.'}<br><a href="/">Back</a></div>`);
});

app.get('/delete/:index', (req, res) => {
    const item = db[req.params.index];
    if (item && item.filename) { try { fs.unlinkSync(path.join(SUB_DIR, item.filename)); } catch(e) {} }
    db.splice(req.params.index, 1);
    saveData();
    res.redirect('/admin');
});

// تشغيل الـ Addon
app.get('/manifest.json', (req, res) => res.json(manifest));
app.get('/subtitles/:type/:id/:extra?.json', (req, res) => {
    builder.getInterface().get('subtitles', req.params.type, req.params.id)
        .then(r => res.json(r)).catch(() => res.json({ subtitles: [] }));
});

app.listen(process.env.PORT || 3000, () => console.log("System Ready!"));
