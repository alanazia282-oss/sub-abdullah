const express = require('express');
const { addonBuilder } = require('stremio-addon-sdk');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cors = require('cors');

const app = express();

// --- [1] إعداد الملفات وقواعد البيانات ---
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

// --- [2] إعدادات السيرفر ---
const upload = multer({ dest: 'subtitles/' });
app.use(cors());
app.use(express.json());
app.use('/download', express.static('subtitles'));

// --- [3] Stremio Manifest ---
const manifest = {
    id: "org.abdullah.ultimate.v13",
    version: "13.0.0",
    name: "Abdullah Ultimate Pro",
    description: "نظام متطور لجلب أسماء الحلقات وصورها تلقائياً",
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

    // الخطوة 1: تسجيل العمل فوراً في الموقع (المنطق الذي نجح معك)
    let existingEntry = history.find(h => h.id === fullId);
    if (!existingEntry) {
        const newEntry = {
            id: fullId,
            name: "جاري جلب تفاصيل الحلقة...", 
            poster: `https://images.metahub.space/poster/medium/${cleanId}/img`,
            type: args.type,
            time: new Date().toLocaleTimeString('ar-SA')
        };
        history = [newEntry, ...history].slice(0, 20);
        saveData();
    }

    // الخطوة 2: تحديث التفاصيل (العنوان + الصورة المصغرة) في الخلفية
    updateMetaDetails(args.type, fullId, cleanId);

    // الخطوة 3: عرض الترجمات المرفوعة
    const foundSubs = db.filter(s => s.id === fullId).map(s => ({
        id: s.url,
        url: s.url,
        lang: "ara",
        label: s.label || "ترجمة عبدالله"
    }));

    return { subtitles: foundSubs };
});

// وظيفة جلب عناوين الحلقات والصور المصغرة
async function updateMetaDetails(type, fullId, cleanId) {
    try {
        let finalName = "";
        let finalPoster = "";
        const parts = fullId.split(':');
        const season = parts[1];
        const episode = parts[2];

        if (cleanId.startsWith('tt')) {
            const res = await axios.get(`https://v3-cinemeta.strem.io/meta/${type}/${cleanId}.json`, { timeout: 5000 });
            if (res.data && res.data.meta) {
                const meta = res.data.meta;
                if (type === 'series' && season && episode) {
                    const ep = meta.videos?.find(v => v.season == season && v.number == episode);
                    finalName = `${meta.name} - ${ep && ep.title ? ep.title : 'الحلقة ' + episode}`;
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
                finalName = attr.canonicalTitle;
                finalPoster = attr.posterImage.medium;

                if (episode) {
                    try {
                        const epRes = await axios.get(`https://kitsu.io/api/edge/anime/${kitsuId}/episodes?filter[number]=${episode}`);
                        if (epRes.data && epRes.data.data[0]) {
                            const epAttr = epRes.data.data[0].attributes;
                            finalName += ` - ${epAttr.canonicalTitle || 'الحلقة ' + episode}`;
                            if (epAttr.thumbnail) finalPoster = epAttr.thumbnail.original;
                        } else {
                            finalName += ` - الحلقة ${episode}`;
                        }
                    } catch (e) { finalName += ` - الحلقة ${episode}`; }
                }
            }
        }

        if (finalName) {
            history = history.map(h => h.id === fullId ? { ...h, name: finalName, poster: finalPoster } : h);
            saveData();
        }
    } catch (e) {
        console.log("Update failed for: " + fullId);
    }
}

// --- [5] الواجهة الرسومية ---
const CSS = `
<style>
    :root { --main: #0f172a; --card: #1e293b; --accent: #38bdf8; --text: #f1f5f9; }
    body { background: var(--main); color: var(--text); font-family: 'Segoe UI', Tahoma, sans-serif; margin: 0; direction: rtl; }
    .nav { background: var(--card); padding: 15px 8%; border-bottom: 3px solid var(--accent); display: flex; justify-content: space-between; align-items: center; }
    .container { max-width: 1100px; margin: 30px auto; padding: 0 20px; display: grid; grid-template-columns: 2fr 1fr; gap: 25px; }
    .history-card { background: var(--card); border-radius: 12px; display: flex; margin-bottom: 15px; overflow: hidden; border: 1px solid #334155; transition: 0.3s; }
    .history-card:hover { border-color: var(--accent); transform: scale(1.01); }
    .history-card img { width: 100px; height: 140px; object-fit: cover; background: #000; }
    .content { padding: 15px; flex-grow: 1; display: flex; flex-direction: column; justify-content: center; }
    .btn { background: var(--accent); color: #000; padding: 8px 18px; border-radius: 6px; text-decoration: none; font-weight: bold; display: inline-block; margin-top: 10px; width: fit-content; border: none; cursor: pointer; }
    .sidebar { background: var(--card); padding: 20px; border-radius: 12px; height: fit-content; border: 1px solid #334155; }
    input { width: 100%; padding: 10px; margin: 10px 0; border-radius: 5px; border: 1px solid #334155; background: #0f172a; color: white; box-sizing: border-box; }
</style>
`;

app.get('/', (req, res) => {
    let rows = history.map(h => `
        <div class="history-card">
            <img src="${h.poster}" onerror="this.src='https://via.placeholder.com/100x140?text=No+Image'">
            <div class="content">
                <h3 style="margin:0; color:var(--accent);">${h.name}</h3>
                <code style="font-size:0.8rem; color:#94a3b8;">${h.id}</code>
                <a href="/upload-page/${encodeURIComponent(h.id)}" class="btn">رفع ترجمة</a>
            </div>
        </div>
    `).join('');

    res.send(`<html><head>${CSS}</head><body>
        <div class="nav"><h2>Abdullah Ultimate Panel</h2></div>
        <div class="container">
            <div>
                <h2 style="margin-top:0;">📺 آخر المشاهدات</h2>
                ${rows || '<p style="color:#64748b">شغل شي في ستريميو الحين...</p>'}
            </div>
            <div class="sidebar">
                <h3>🛠 الإعدادات</h3>
                <p style="font-size:0.8rem">رابط الإضافة لستريميو:</p>
                <input value="https://${req.get('host')}/manifest.json" readonly onclick="this.select()">
                <a href="stremio://${req.get('host')}/manifest.json" class="btn" style="width:100%; text-align:center;">تثبيت الإضافة</a>
                <hr style="border:0; border-top:1px solid #334155; margin:20px 0;">
                <p>الملفات: <b>${db.length}</b></p>
                <a href="/admin" style="color:var(--accent)">إدارة الملفات المرفوعة</a>
            </div>
        </div>
        <script>setTimeout(()=>location.reload(), 12000)</script>
    </body></html>`);
});

// --- [6] مسارات الرفع والحذف ---
app.get('/upload-page/:id', (req, res) => {
    const item = history.find(h => h.id === req.params.id);
    res.send(`<html><head>${CSS}</head><body>
        <div class="container" style="display:block; max-width:500px; margin-top:100px;">
            <div class="sidebar">
                <h2>رفع ملف لـ:</h2>
                <p style="color:var(--accent)">${item ? item.name : req.params.id}</p>
                <form action="/upload" method="POST" enctype="multipart/form-data">
                    <input type="hidden" name="id" value="${req.params.id}">
                    <input type="file" name="sub" accept=".srt" required>
                    <input type="text" name="label" placeholder="اسم المترجم">
                    <button type="submit" class="btn" style="width:100%">نشر الترجمة ✅</button>
                </form>
                <br><a href="/" style="color:#888; text-decoration:none;">رجوع</a>
            </div>
        </div>
    </body></html>`);
});

app.post('/upload', upload.single('sub'), (req, res) => {
    if (req.file) {
        db.push({ id: req.body.id, url: `https://${req.get('host')}/download/${req.file.filename}`, label: req.body.label || "ترجمة عبدالله", filename: req.file.filename });
        saveData();
    }
    res.redirect('/');
});

app.get('/admin', (req, res) => {
    let rows = db.map((s, i) => `<div class="history-card" style="padding:15px; align-items:center;">
        <div style="flex-grow:1"><b>${s.label}</b><br><small>${s.id}</small></div>
        <a href="/delete/${i}" style="color:#ef4444; font-weight:bold;">حذف</a>
    </div>`).join('');
    res.send(`<html><head>${CSS}</head><body><div class="container" style="display:block; max-width:800px;">
        <h2>📂 إدارة المرفوعات</h2>
        ${rows || '<p>لا توجد ملفات.</p>'}
        <br><a href="/" class="btn">العودة</a>
    </div></body></html>`);
});

app.get('/delete/:i', (req, res) => {
    const s = db[req.params.i];
    if (s && s.filename) { try { fs.unlinkSync(path.join(SUB_DIR, s.filename)); } catch(e){} }
    db.splice(req.params.i, 1);
    saveData();
    res.redirect('/admin');
});

// --- [7] تشغيل السيرفر ---
app.get('/manifest.json', (req, res) => res.json(manifest));
app.get('/subtitles/:type/:id/:extra?.json', (req, res) => {
    builder.getInterface().get('subtitles', req.params.type, req.params.id).then(r => res.json(r)).catch(()=>res.json({subtitles:[]}));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Abdullah System V13 is running on port ${PORT}`));
