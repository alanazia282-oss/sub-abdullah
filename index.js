const express = require('express');
const { addonBuilder } = require('stremio-addon-sdk');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cors = require('cors');

const app = express();

// --- [1] إعدادات البيانات ---
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

// --- [2] الإعدادات الأساسية ---
const upload = multer({ dest: 'subtitles/' });
app.use(cors());
app.use(express.json());
app.use('/download', express.static('subtitles'));

const manifest = {
    id: "org.abdullah.ultimate.v12",
    version: "12.1.0",
    name: "Community Subtitles",
    description: "Subtitle Manager with Instant Meta",
    resources: ["subtitles"],
    types: ["movie", "series", "anime"],
    idPrefixes: ["tt", "kitsu"],
    catalogs: []
};

const builder = new addonBuilder(manifest);

// --- [3] معالج الطلبات وذكاء البيانات ---
builder.defineSubtitlesHandler(async (args) => {
    const fullId = args.id;
    const parts = fullId.split(':');
    const cleanId = parts[0];

    let existingEntry = history.find(h => h.id === fullId);
    
    // إذا كان السجل غير موجود، ننشئه ببيانات "ذكية" فوراً دون انتظار السيرفر
    if (!existingEntry) {
        let tempName = cleanId;
        if (parts.length >= 3) tempName = `${cleanId} (S${parts[1]} E${parts[2]})`;
        
        const newEntry = {
            id: fullId,
            name: tempName, 
            poster: `https://images.metahub.space/poster/medium/${cleanId}/img`,
            type: args.type,
            time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
            subsCount: db.filter(s => s.id === fullId).length
        };
        history = [newEntry, ...history].slice(0, 25);
        saveData();
    }

    // محاولة تحسين الاسم والصورة في الخلفية (اختياري)
    updateMetaInBack(args.type, fullId, cleanId, parts);

    const foundSubs = db.filter(s => s.id === fullId).map(s => ({
        id: s.url, url: s.url, lang: "ara", label: s.label || "Arabic Sub"
    }));

    return { subtitles: foundSubs };
});

async function updateMetaInBack(type, fullId, cleanId, parts) {
    try {
        let finalName = "";
        let finalPoster = "";

        if (cleanId.startsWith('tt')) {
            const res = await axios.get(`https://v3-cinemeta.strem.io/meta/${type}/${cleanId}.json`, { timeout: 5000 });
            if (res.data && res.data.meta) {
                const meta = res.data.meta;
                if (type === 'series' && parts.length >= 3) {
                    const ep = meta.videos?.find(v => v.season == parts[1] && v.number == parts[2]);
                    finalName = `${meta.name} - S${parts[1]}E${parts[2]}`;
                    finalPoster = ep?.thumbnail || meta.poster;
                } else {
                    finalName = meta.name;
                    finalPoster = meta.poster;
                }
            }
        }

        if (finalName) {
            history = history.map(h => h.id === fullId ? { ...h, name: finalName, poster: finalPoster || h.poster } : h);
            saveData();
        }
    } catch (e) {
        // فشل السيرفر لن يعطل العرض لأننا وضعنا بيانات أولية بالفعل
    }
}

// --- [4] الواجهة الرسومية ---
app.get('/', (req, res) => {
    let listHtml = history.map(h => `
        <div style="display:flex; background:white; margin-bottom:15px; border-radius:10px; overflow:hidden; box-shadow:0 2px 5px rgba(0,0,0,0.1); border:1px solid #eee;">
            <img src="${h.poster}" onerror="this.src='https://via.placeholder.com/100x150?text=No+Poster'" style="width:100px; height:140px; object-fit:cover;">
            <div style="padding:15px; flex-grow:1; font-family:sans-serif;">
                <div style="font-size:10px; color:#1877f2; font-weight:bold; text-transform:uppercase;">${h.type}</div>
                <h3 style="margin:5px 0; font-size:16px;">${h.name}</h3>
                <code style="font-size:11px; color:#777;">ID: ${h.id}</code>
                <div style="margin-top:10px;">
                    <a href="/upload-page/${encodeURIComponent(h.id)}" style="background:#1877f2; color:white; text-decoration:none; padding:5px 12px; border-radius:5px; font-size:12px;">+ Upload Sub</a>
                    <span style="margin-left:10px; font-size:12px; color:#28a745; font-weight:bold;">${h.subsCount} Subs</span>
                </div>
            </div>
        </div>
    `).join('');

    res.send(`
        <body style="background:#f7f7f7; margin:0; padding:20px;">
            <div style="max-width:800px; margin:0 auto;">
                <h2 style="font-family:sans-serif; color:#333;">Recent Activity</h2>
                ${listHtml || '<p>Play something in Stremio first...</p>'}
            </div>
            <script>setTimeout(()=>location.reload(), 8000);</script>
        </body>
    `);
});

// --- [5] مسارات الرفع المتبقية ---
app.get('/upload-page/:id', (req, res) => {
    res.send(`
        <body style="font-family:sans-serif; padding:50px; background:#f7f7f7;">
            <div style="max-width:400px; margin:0 auto; background:white; padding:20px; border-radius:10px; box-shadow:0 2px 10px rgba(0,0,0,0.1);">
                <h3>Upload for ${req.params.id}</h3>
                <form action="/upload" method="POST" enctype="multipart/form-data">
                    <input type="hidden" name="imdbId" value="${req.params.id}">
                    <input type="file" name="subFile" accept=".srt" required style="margin-bottom:15px;"><br>
                    <input type="text" name="label" placeholder="Translator Label" style="width:100%; padding:8px; margin-bottom:15px;">
                    <button type="submit" style="width:100%; background:#1877f2; color:white; border:none; padding:10px; border-radius:5px; cursor:pointer;">Publish</button>
                </form>
            </div>
        </body>
    `);
});

app.post('/upload', upload.single('subFile'), (req, res) => {
    if (req.file) {
        db.push({ id: req.body.imdbId, url: `https://${req.get('host')}/download/${req.file.filename}`, label: req.body.label || "Arabic", filename: req.file.filename });
        saveData();
    }
    res.redirect('/');
});

app.get('/manifest.json', (req, res) => res.json(manifest));
app.get('/subtitles/:type/:id/:extra?.json', (req, res) => {
    builder.getInterface().get('subtitles', req.params.type, req.params.id)
        .then(r => res.json(r)).catch(() => res.json({ subtitles: [] }));
});

app.listen(process.env.PORT || 3000);
