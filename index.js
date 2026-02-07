const express = require('express');
const { addonBuilder } = require('stremio-addon-sdk');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cors = require('cors');
const app = express();

// إعداد المجلدات والملفات
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
app.use(cors());
app.use(express.json());
app.use('/download', express.static('subtitles'));

// إصلاح الـ Manifest بإضافة مصفوفة فارغة للـ catalogs
const manifest = {
    id: "org.abdullah.pro.system.v1",
    version: "1.0.0",
    name: "Sub Abdullah Ultimate",
    description: "إدارة الترجمة - جلب تلقائي من IMDb و Kitsu",
    resources: ["subtitles"],
    types: ["movie", "series", "anime"],
    idPrefixes: ["tt", "kitsu"],
    catalogs: [] // هذا السطر هو حل المشكلة
};

const builder = new addonBuilder(manifest);

builder.defineSubtitlesHandler(async (args) => {
    try {
        const parts = args.id.split(':');
        const cleanId = parts[0];
        let name = "Unknown";
        let poster = "";

        // جلب من IMDb
        if (cleanId.startsWith('tt')) {
            try {
                const res = await axios.get(`https://v3-cinemeta.strem.io/meta/${args.type}/${cleanId}.json`, { timeout: 3000 });
                if (res.data && res.data.meta) {
                    const meta = res.data.meta;
                    if (args.type === 'series' && parts[1] && parts[2]) {
                        const ep = meta.videos.find(v => v.season == parts[1] && v.number == parts[2]);
                        name = ep ? `${meta.name} - ${ep.title}` : meta.name;
                        poster = (ep && ep.thumbnail) ? ep.thumbnail : meta.poster;
                    } else {
                        name = meta.name;
                        poster = meta.poster;
                    }
                }
            } catch (e) {}
        }

        // جلب من Kitsu
        if (name === "Unknown" || cleanId.startsWith('kitsu')) {
            try {
                const kitsuId = cleanId.replace('kitsu:', '');
                const kRes = await axios.get(`https://kitsu.io/api/edge/anime/${kitsuId}`, { timeout: 3000 });
                if (kRes.data && kRes.data.data) {
                    const animeName = kRes.data.data.attributes.canonicalTitle;
                    poster = kRes.data.data.attributes.posterImage.medium;
                    if (parts[1]) {
                        const epRes = await axios.get(`https://kitsu.io/api/edge/episodes?filter[mediaId]=${kitsuId}&filter[number]=${parts[1]}`, { timeout: 2000 });
                        if (epRes.data && epRes.data.data[0]) {
                            const epAttr = epRes.data.data[0].attributes;
                            name = `${animeName} - ${epAttr.canonicalTitle || 'الحلقة ' + parts[1]}`;
                            if (epAttr.thumbnail) poster = epAttr.thumbnail.original;
                        }
                    } else { name = animeName; }
                }
            } catch (e) {}
        }

        // تحديث السجل
        const newEntry = {
            id: args.id,
            name: name,
            poster: poster || `https://images.metahub.space/poster/medium/${cleanId}/img`,
            type: args.type,
            season: parts[1] || null,
            episode: parts[2] || null
        };
        history = [newEntry, ...history.filter(h => h.id !== args.id)].slice(0, 15);
        saveData();
    } catch (err) {}

    const subs = db.filter(s => s.id === args.id).map(s => ({
        id: s.url,
        url: s.url,
        lang: "ara",
        label: s.label
    }));
    return { subtitles: subs };
});

const style = `<style>:root{--main:#1a1a2e;--accent:#e94560}body{background:#16213e;color:#fff;font-family:sans-serif;margin:0;direction:rtl}.nav{background:var(--main);padding:15px;border-bottom:2px solid var(--accent)}.container{max-width:1000px;margin:20px auto;padding:0 20px;display:grid;grid-template-columns:2fr 1fr;gap:20px}.card{background:var(--main);border-radius:10px;padding:20px}.item-row{display:flex;align-items:center;padding:10px;border-bottom:1px solid #24344d}.poster{width:60px;height:85px;border-radius:5px;margin-left:15px}.btn{background:var(--accent);color:#fff;text-decoration:none;padding:8px 15px;border-radius:5px;font-weight:700;border:none;cursor:pointer}</style>`;

app.get('/', (req, res) => {
    let rows = history.map(h => `<div class="item-row"><img src="${h.poster}" class="poster"><div style="flex-grow:1"><h4 style="margin:0">${h.name}</h4><small>${h.id}</small></div><a href="/upload-page/${encodeURIComponent(h.id)}" class="btn">رفع ترجمة</a></div>`).join('');
    res.send(`${style}<div class="nav"><h2>Abdullah Admin</h2></div><div class="container"><div class="card"><h3>النشاط الأخير</h3>${rows || 'شغل شي في ستريميو...'}</div><div class="card"><h4>الإضافة</h4><input style="width:100%;padding:8px;background:#0f3460;color:#fff;border:none;" readonly value="https://${req.get('host')}/manifest.json"><br><br><a href="stremio://${req.get('host')}/manifest.json" class="btn">Install</a></div></div>`);
});

app.get('/upload-page/:id', (req, res) => {
    res.send(`${style}<div class="card" style="max-width:400px;margin:100px auto;"><h3>رفع ملف SRT</h3><form action="/upload" method="POST" enctype="multipart/form-data"><input type="hidden" name="imdbId" value="${req.params.id}"><input type="file" name="subFile" accept=".srt" required><br><br><button type="submit" class="btn" style="width:100%;">رفع ✅</button></form></div>`);
});

app.post('/upload', upload.single('subFile'), (req, res) => {
    if (req.file) {
        db.push({ id: req.body.imdbId, url: `https://${req.get('host')}/download/${req.file.filename}`, label: "ترجمة عبدالله" });
        saveData();
    }
    res.redirect('/');
});

app.get('/manifest.json', (req, res) => res.json(manifest));
app.get('/subtitles/:type/:id/:extra?.json', (req, res) => {
    builder.getInterface().get('subtitles', req.params.type, req.params.id).then(r => res.json(r));
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log("Ready!"));
