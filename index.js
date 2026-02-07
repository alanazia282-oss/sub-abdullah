const express = require('express');
const { addonBuilder } = require('stremio-addon-sdk');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cors = require('cors');

const app = express();

// --- [1] Data Management ---
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

// --- [2] Server Setup ---
const upload = multer({ dest: 'subtitles/' });
app.use(cors());
app.use(express.json());
app.use('/download', express.static('subtitles'));

// --- [3] Stremio Manifest ---
const manifest = {
    id: "org.abdullah.community.v1",
    version: "1.0.0",
    name: "Abdullah Subtitles",
    description: "Community style subtitle manager",
    resources: ["subtitles"],
    types: ["movie", "series", "anime"],
    idPrefixes: ["tt", "kitsu"],
    catalogs: [] 
};

const builder = new addonBuilder(manifest);

// --- [4] Subtitles Handler ---
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
            time: new Date().toISOString()
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
        const parts = fullId.split(':');

        if (cleanId.startsWith('tt')) {
            const res = await axios.get(`https://v3-cinemeta.strem.io/meta/${type}/${cleanId}.json`, { timeout: 5000 });
            if (res.data && res.data.meta) {
                const meta = res.data.meta;
                if (type === 'series' && parts[1]) {
                    const ep = meta.videos?.find(v => v.season == parts[1] && v.number == parts[2]);
                    finalName = ep ? `${meta.name} - S${parts[1]}E${parts[2]} ${ep.title || ''}` : meta.name;
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
                const epNum = parts[1];
                finalName = epNum ? `${attr.canonicalTitle} - Episode ${epNum}` : attr.canonicalTitle;
                finalPoster = attr.posterImage.medium;
            }
        }

        if (finalName) {
            history = history.map(h => h.id === fullId ? { ...h, name: finalName, poster: finalPoster } : h);
            saveData();
        }
    } catch (e) { console.error("Meta Update Error"); }
}

// --- [5] New Community UI (English) ---
const UI_STYLE = `
<style>
    :root { --bg: #050505; --card: #111111; --border: #222222; --accent: #ffffff; --text-dim: #888888; }
    body { background: var(--bg); color: #fff; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 0; direction: ltr; }
    .header { padding: 40px 20px; text-align: center; border-bottom: 1px solid var(--border); }
    .header h1 { margin: 0; font-size: 2rem; font-weight: 800; letter-spacing: -1px; }
    .container { max-width: 900px; margin: 0 auto; padding: 40px 20px; }
    .addon-url { background: var(--card); border: 1px solid var(--border); padding: 15px; border-radius: 8px; margin-bottom: 40px; }
    .addon-url input { background: transparent; border: none; color: var(--accent); width: 100%; font-family: monospace; font-size: 0.9rem; outline: none; }
    .section-title { font-size: 0.8rem; text-transform: uppercase; color: var(--text-dim); letter-spacing: 1px; margin-bottom: 20px; }
    .history-card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; display: flex; align-items: center; padding: 12px; margin-bottom: 12px; transition: 0.2s; }
    .history-card:hover { border-color: #444; background: #161616; }
    .history-card img { width: 50px; height: 75px; object-fit: cover; border-radius: 6px; margin-right: 15px; }
    .card-info { flex: 1; }
    .card-info h3 { margin: 0; font-size: 1rem; font-weight: 600; }
    .card-info p { margin: 4px 0 0; font-size: 0.8rem; color: var(--text-dim); }
    .upload-btn { background: var(--accent); color: #000; padding: 8px 16px; border-radius: 6px; text-decoration: none; font-size: 0.85rem; font-weight: 600; }
    .admin-link { display: inline-block; margin-top: 20px; color: var(--text-dim); text-decoration: none; font-size: 0.9rem; }
    .admin-link:hover { color: #fff; }
</style>
`;

app.get('/', (req, res) => {
    let rows = history.map(h => `
        <div class="history-card">
            <img src="${h.poster}" onerror="this.src='https://via.placeholder.com/50x75?text=?'">
            <div class="card-info">
                <h3>${h.name}</h3>
                <p>${h.id}</p>
            </div>
            <a href="/upload-page/${encodeURIComponent(h.id)}" class="upload-btn">Upload</a>
        </div>
    `).join('');

    res.send(`<html><head><title>Abdullah Subs</title>${UI_STYLE}</head><body>
        <div class="header"><h1>Abdullah <span style="font-weight:300">Subtitles</span></h1></div>
        <div class="container">
            <div class="section-title">Addon URL</div>
            <div class="addon-url">
                <input value="https://${req.get('host')}/manifest.json" readonly onclick="this.select()">
            </div>
            <div class="section-title">Recent Activity</div>
            ${rows || '<p style="color:#444">No recent activity detected...</p>'}
            <center><a href="/admin" class="admin-link">Manage Files</a></center>
        </div>
        <script>setTimeout(()=> location.reload(), 10000);</script>
    </body></html>`);
});

app.get('/upload-page/:id', (req, res) => {
    res.send(`<html><head>${UI_STYLE}</head><body>
        <div class="container" style="max-width:450px; margin-top:50px;">
            <div class="addon-url" style="text-align:center;">
                <h2 style="margin-top:0">Upload Subtitle</h2>
                <p style="color:var(--text-dim); font-size:0.9rem;">ID: ${req.params.id}</p>
                <form action="/upload" method="POST" enctype="multipart/form-data">
                    <input type="hidden" name="imdbId" value="${req.params.id}">
                    <input type="file" name="subFile" accept=".srt" required style="margin:20px 0;">
                    <input type="text" name="label" placeholder="Translator Name (e.g. Abdullah)" style="margin-bottom:20px; padding:10px; background:#000; border:1px solid var(--border); border-radius:5px;">
                    <button type="submit" class="upload-btn" style="width:100%; border:none; cursor:pointer; padding:12px;">Publish Now</button>
                </form>
                <br><a href="/" style="color:var(--text-dim); font-size:0.8rem; text-decoration:none;">Cancel</a>
            </div>
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
    let list = db.map((s, i) => `
        <div class="history-card">
            <div class="card-info"><h3>${s.label}</h3><p>${s.id}</p></div>
            <a href="/delete/${i}" style="color:#ff4444; font-size:0.8rem; text-decoration:none; font-weight:bold;">Delete</a>
        </div>`).join('');
    res.send(`<html><head>${UI_STYLE}</head><body><div class="container">
        <div class="section-title">Managed Subtitles</div>
        ${list || '<p>No files found.</p>'}
        <br><a href="/" class="admin-link">← Back to Dashboard</a>
    </div></body></html>`);
});

app.get('/delete/:index', (req, res) => {
    const item = db[req.params.index];
    if (item?.filename) { try { fs.unlinkSync(path.join(SUB_DIR, item.filename)); } catch(e){} }
    db.splice(req.params.index, 1);
    saveData();
    res.redirect('/admin');
});

app.get('/manifest.json', (req, res) => res.json(manifest));
app.get('/subtitles/:type/:id/:extra?.json', (req, res) => {
    builder.getInterface().get('subtitles', req.params.type, req.params.id).then(r => res.json(r)).catch(()=>res.json({subtitles:[]}));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Community Style UI Running`));
