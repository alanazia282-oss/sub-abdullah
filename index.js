const express = require('express');
const { addonBuilder } = require('stremio-addon-sdk');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const app = express();

// إعداد المجلدات
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
const subDir = path.join(__dirname, 'subtitles');
if (!fs.existsSync(subDir)) fs.mkdirSync(subDir);

const DB_FILE = path.join(DATA_DIR, 'db.json');
const HISTORY_FILE = path.join(DATA_DIR, 'history.json');

let db = fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE)) : [];
let history = fs.existsSync(HISTORY_FILE) ? JSON.parse(fs.readFileSync(HISTORY_FILE)) : [];

const saveData = () => {
    fs.writeFileSync(DB_FILE, JSON.stringify(db));
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(history));
};

const upload = multer({ dest: 'subtitles/' });
app.use(express.json());
app.use('/download', express.static('subtitles'));

const manifest = {
    id: "org.abdullah.fix.v2",
    version: "2.0.0",
    name: "Sub Abdullah Pro",
    description: "نظام جلب البيانات المطور - IMDb & Kitsu",
    resources: ["subtitles"],
    types: ["movie", "series", "anime"],
    idPrefixes: ["tt", "kitsu"],
    catalogs: []
};

const builder = new addonBuilder(manifest);

builder.defineSubtitlesHandler(async (args) => {
    try {
        const idParts = args.id.split(':');
        const imdbId = idParts[0]; // tt1234567 أو kitsu:123
        const season = idParts[1] || null;
        const episode = idParts[2] || null;

        let name = "عمل غير معروف";
        let poster = `https://images.metahub.space/poster/medium/${imdbId}/img`;

        // محاولة جلب البيانات من عدة مصادر
        try {
            if (args.id.includes('kitsu')) {
                const kId = imdbId.replace('kitsu:', '');
                const res = await axios.get(`https://kitsu.io/api/edge/anime/${kId}`, { timeout: 4000 });
                name = res.data.data.attributes.canonicalTitle;
                poster = res.data.data.attributes.posterImage.medium;
            } else {
                const res = await axios.get(`https://v3-cinemeta.strem.io/meta/${args.type}/${imdbId}.json`, { timeout: 4000 });
                if (res.data && res.data.meta) {
                    name = res.data.meta.name;
                    poster = res.data.meta.poster;
                }
            }
        } catch (e) {
            console.log("External API Error, using IDs");
            name = `ID: ${imdbId}`;
        }

        const newEntry = {
            id: args.id,
            name: name,
            poster: poster,
            type: args.type,
            season: season,
            episode: episode,
            time: new Date().toLocaleTimeString('ar-SA')
        };

        // تحديث السجل وحذف المكرر
        history = [newEntry, ...history.filter(h => h.id !== args.id)].slice(0, 20);
        saveData();

    } catch (err) {
        console.error("Handler Error:", err);
    }
    return Promise.resolve({ subtitles: db.filter(s => s.id === args.id) });
});

// الواجهة الرسومية
const style = `
<style>
    body { background: #1a1a1a; color: white; font-family: sans-serif; direction: rtl; padding: 20px; }
    .card { background: #252525; border-radius: 10px; padding: 15px; margin-bottom: 15px; display: flex; align-items: center; border: 1px solid #333; }
    .poster { width: 60px; height: 90px; border-radius: 5px; margin-left: 15px; object-fit: cover; }
    .btn { background: #e50914; color: white; padding: 8px 15px; border-radius: 5px; text-decoration: none; font-weight: bold; }
    .info { flex-grow: 1; }
    .info h3 { margin: 0 0 5px 0; font-size: 1.1rem; }
    .details { color: #aaa; font-size: 0.85rem; }
</style>`;

app.get('/', (req, res) => {
    let html = history.map(h => `
        <div class="card">
            <img src="${h.poster}" class="poster" onerror="this.src='https://via.placeholder.com/60x90?text=No+Image'">
            <div class="info">
                <h3>${h.name}</h3>
                <div class="details">
                    <span>${h.type === 'series' ? 'مسلسل' : 'فيلم'}</span> | 
                    <span>الموسم: ${h.season || '1'}</span> | 
                    <span>الحلقة: ${h.episode || '1'}</span>
                </div>
            </div>
            <a href="/upload-page/${h.id}" class="btn">رفع ترجمة</a>
        </div>
    `).join('');

    res.send(`${style}
        <h1>لوحة تحكم عبدالله Pro</h1>
        <p>رابط الإضافة: <code>https://${req.get('host')}/manifest.json</code></p>
        <hr>
        ${html || '<p>لا يوجد سجل حالياً. شغل حلقة في ستريميو أولاً!</p>'}
        <script>setTimeout(()=>location.reload(), 10000);</script>
    `);
});

app.get('/upload-page/:id', (req, res) => {
    const item = history.find(h => h.id === req.params.id);
    if (!item) return res.redirect('/');
    res.send(`${style}
        <div style="text-align:center; margin-top:50px;">
            <h3>رفع ملف الترجمة لـ ${item.name}</h3>
            <form action="/upload" method="POST" enctype="multipart/form-data">
                <input type="hidden" name="imdbId" value="${item.id}">
                <input type="file" name="subFile" accept=".srt" required><br><br>
                <button type="submit" class="btn">ابدأ الرفع الآن</button>
            </form>
        </div>
    `);
});

app.post('/upload', upload.single('subFile'), (req, res) => {
    const subUrl = `https://${req.get('host')}/download/${req.file.filename}`;
    db.push({ id: req.body.imdbId, lang: "ara", url: subUrl });
    saveData();
    res.redirect('/');
});

app.get('/manifest.json', (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.json(manifest);
});

app.get('/subtitles/:type/:id/:extra?.json', (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    builder.getInterface().get('subtitles', req.params.type, req.params.id).then(r => res.json(r));
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log("Server running..."));
