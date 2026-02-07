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
    name: "Abdullah Ultimate Sub",
    description: "نظام عبدالله المتكامل - جلب تلقائي للأسماء والصور بدقة عالية",
    resources: ["subtitles"],
    types: ["movie", "series", "anime"],
    idPrefixes: ["tt", "kitsu"],
    catalogs: [] 
};

const builder = new addonBuilder(manifest);

// --- [4] محرك جلب البيانات الذكي (المنطق المعتمد لديك) ---
builder.defineSubtitlesHandler(async (args) => {
    const fullId = args.id;
    const cleanId = fullId.split(':')[0];

    // الخطوة أ: تسجيل أولي سريع (ليظهر في الموقع فوراً)
    let existingEntry = history.find(h => h.id === fullId);
    if (!existingEntry) {
        const newEntry = {
            id: fullId,
            name: "جاري جلب الاسم...", // سيتم تحديثه بعد ثوانٍ
            poster: `https://images.metahub.space/poster/medium/${cleanId}/img`,
            type: args.type,
            time: new Date().toLocaleTimeString('ar-SA')
        };
        history = [newEntry, ...history].slice(0, 20);
        saveData();
    }

    // الخطوة ب: جلب البيانات العميقة في الخلفية (Async Background Update)
    updateMetaInBackground(args.type, fullId, cleanId);

    // الخطوة ج: البحث عن الترجمات المخزنة
    const foundSubs = db.filter(s => s.id === fullId).map(s => ({
        id: s.url,
        url: s.url,
        lang: "ara",
        label: s.label || "ترجمة عبدالله"
    }));

    return { subtitles: foundSubs };
});

async function updateMetaInBackground(type, fullId, cleanId) {
    try {
        let finalName = "";
        let finalPoster = "";

        if (cleanId.startsWith('tt')) {
            const res = await axios.get(`https://v3-cinemeta.strem.io/meta/${type}/${cleanId}.json`, { timeout: 5000 });
            if (res.data && res.data.meta) {
                const meta = res.data.meta;
                const parts = fullId.split(':');
                if (type === 'series' && parts[1]) {
                    const ep = meta.videos?.find(v => v.season == parts[1] && v.number == parts[2]);
                    finalName = ep ? `${meta.name} - ${ep.title || 'EP '+parts[2]}` : meta.name;
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
                const epNum = fullId.split(':')[1];
                finalName = epNum ? `${attr.canonicalTitle} - حلقة ${epNum}` : attr.canonicalTitle;
                finalPoster = attr.posterImage.medium || attr.posterImage.original;
            }
        }

        if (finalName) {
            history = history.map(h => h.id === fullId ? { ...h, name: finalName, poster: finalPoster } : h);
            saveData();
        }
    } catch (e) {
        console.error("Meta Update Error for ID: " + fullId);
    }
}

// --- [5] الواجهة الرسومية الفخمة ---
const dashboardStyle = `
<style>
    :root { --main: #0f172a; --card: #1e293b; --accent: #38bdf8; --text: #f1f5f9; --danger: #ef4444; }
    body { background: var(--main); color: var(--text); font-family: 'Inter', sans-serif; margin: 0; direction: rtl; }
    .navbar { background: var(--card); padding: 20px 8%; display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid var(--accent); box-shadow: 0 4px 15px rgba(0,0,0,0.3); }
    .container { max-width: 1200px; margin: 40px auto; padding: 0 20px; display: grid; grid-template-columns: 2fr 1fr; gap: 30px; }
    .main-panel { background: var(--card); border-radius: 16px; padding: 25px; border: 1px solid #334155; }
    .sidebar { display: flex; flex-direction: column; gap: 20px; }
    .history-item { display: flex; background: #0f172a; border-radius: 12px; margin-bottom: 15px; overflow: hidden; border: 1px solid #334155; transition: 0.3s; }
    .history-item:hover { transform: translateY(-3px); border-color: var(--accent); }
    .history-item img { width: 90px; height: 130px; object-fit: cover; }
    .item-details { padding: 15px; flex-grow: 1; display: flex; flex-direction: column; justify-content: space-between; }
    .btn { background: var(--accent); color: #0f172a; padding: 10px 20px; border-radius: 8px; text-decoration: none; font-weight: bold; text-align: center; border: none; cursor: pointer; transition: 0.3s; }
    .btn:hover { opacity: 0.9; box-shadow: 0 0 15px rgba(56, 189, 248, 0.4); }
    .stat-card { background: var(--card); border-radius: 16px; padding: 20px; border: 1px solid #334155; }
    input { width: 100%; padding: 12px; background: #0f172a; color: #fff; border: 1px solid #334155; border-radius: 8px; margin-top: 8px; box-sizing: border-box; }
</style>
`;

app.get('/', (req, res) => {
    let itemsHtml = history.map(h => `
        <div class="history-item">
            <img src="${h.poster}" onerror="this.src='https://via.placeholder.com/90x130?text=No+Image'">
            <div class="item-details">
                <div>
                    <h3 style="margin:0; font-size:1.1rem; color:var(--accent);">${h.name}</h3>
                    <small style="color:#94a3b8;">ID: ${h.id}</small>
                </div>
                <a href="/upload-page/${encodeURIComponent(h.id)}" class="btn" style="width: fit-content; padding: 6px 15px; font-size: 0.9rem;">إضافة ترجمة</a>
            </div>
        </div>
    `).join('');

    res.send(`${dashboardStyle}
        <div class="navbar">
            <h1 style="margin:0; font-size:24px;">Abdullah <span style="color:var(--accent)">System v12</span></h1>
            <div style="font-size:0.9rem; color:#94a3b8;">لوحة تحكم المترجم</div>
        </div>
        <div class="container">
            <div class="main-panel">
                <h2 style="margin-top:0; border-bottom:1px solid #334155; padding-bottom:10px;">📋 سجل النشاط المباشر</h2>
                ${itemsHtml || '<div style="text-align:center; padding:50px; color:#64748b;">انتظر ظهور طلبات من ستريميو...</div>'}
            </div>
            <div class="sidebar">
                <div class="stat-card">
                    <h3 style="margin-top:0; color:var(--accent);">⚙️ إعدادات الربط</h3>
                    <p style="font-size:0.85rem;">رابط الإضافة المباشر (انسخه لستريميو):</p>
                    <input readonly value="https://${req.get('host')}/manifest.json" onclick="this.select()">
                    <a href="stremio://${req.get('host')}/manifest.json" class="btn" style="display:block; margin-top:15px;">تثبيت تلقائي ⚡</a>
                </div>
                <div class="stat-card">
                    <h3 style="margin-top:0;">📊 إحصائيات</h3>
                    <p>عدد الملفات المرفوعة: <b>${db.length}</b></p>
                    <a href="/admin" style="color:var(--accent); text-decoration:none; font-weight:bold;">📂 إدارة الملفات والتنظيف ←</a>
                </div>
            </div>
        </div>
        <script>setTimeout(()=> { if(location.pathname==='/') location.reload(); }, 10000);</script>
    `);
});

// --- [6] مسارات الرفع والإدارة ---
app.get('/upload-page/:id', (req, res) => {
    const item = history.find(h => h.id === req.params.id);
    res.send(`${dashboardStyle}
        <div class="main-panel" style="max-width:500px; margin:100px auto;">
            <h2 style="color:var(--accent)">رفع ترجمة جديدة</h2>
            <p>المحتوى: <b>${item ? item.name : req.params.id}</b></p>
            <form action="/upload" method="POST" enctype="multipart/form-data">
                <input type="hidden" name="imdbId" value="${req.params.id}">
                <div style="margin-bottom:15px;">
                    <label>اختر ملف SRT:</label>
                    <input type="file" name="subFile" accept=".srt" required>
                </div>
                <div style="margin-bottom:15px;">
                    <label>اسم المترجم:</label>
                    <input type="text" name="label" placeholder="عبدالله">
                </div>
                <button type="submit" class="btn" style="width:100%">تأكيد النشر ✅</button>
            </form>
            <br><a href="/" style="color:#94a3b8; display:block; text-align:center;">إلغاء والعودة</a>
        </div>`);
});

app.post('/upload', upload.single('subFile'), (req, res) => {
    if (req.file) {
        db.push({ 
            id: req.body.imdbId, 
            url: `https://${req.get('host')}/download/${req.file.filename}`, 
            label: req.body.label || "ترجمة عبدالله",
            filename: req.file.filename
        });
        saveData();
    }
    res.redirect('/');
});

app.get('/admin', (req, res) => {
    let list = db.map((s, i) => `
        <div class="history-item" style="padding:15px; align-items:center;">
            <div style="flex-grow:1">
                <b style="color:var(--accent)">${s.label}</b><br>
                <small>${s.id}</small>
            </div>
            <a href="/delete/${i}" class="btn" style="background:var(--danger); color:white;">حذف</a>
        </div>`).join('');
    res.send(`${dashboardStyle}
        <div class="container" style="grid-template-columns: 1fr;">
            <div class="main-panel">
                <h2>📁 إدارة الملفات المرفوعة</h2>
                ${list || '<p>لا توجد ملفات مرفوعة حالياً.</p>'}
                <br><a href="/" class="btn">العودة للرئيسية</a>
            </div>
        </div>`);
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

// --- [7] تفعيل المسارات الخاصة بـ Stremio ---
app.get('/manifest.json', (req, res) => res.json(manifest));
app.get('/subtitles/:type/:id/:extra?.json', (req, res) => {
    builder.getInterface().get('subtitles', req.params.type, req.params.id)
        .then(r => res.json(r))
        .catch(() => res.json({ subtitles: [] }));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Abdullah System V12 Active on port ${PORT}`));
