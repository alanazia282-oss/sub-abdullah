const express = require('express');
const { addonBuilder } = require('stremio-addon-sdk');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cors = require('cors');

const app = express();

// --- إعداد المسارات والمجلدات وقاعدة البيانات ---
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

// --- إعدادات الميدل وير والرفع ---
const upload = multer({ dest: 'subtitles/' });
app.use(cors());
app.use(express.json());
app.use('/download', express.static('subtitles'));

// --- مانيفست الإضافة (Stremio Manifest) ---
const manifest = {
    id: "org.abdullah.kitsu.only.v8",
    version: "8.0.0",
    name: "Abdullah Kitsu Main",
    description: "نظام عبدالله المعتمد كلياً على Kitsu لجلب صور وأسماء الحلقات بدقة",
    resources: ["subtitles"],
    types: ["movie", "series", "anime"],
    idPrefixes: ["tt", "kitsu"],
    catalogs: []
};

const builder = new addonBuilder(manifest);

// --- محرك البحث الرئيسي (التركيز على Kitsu) ---
async function getFullMeta(type, fullId) {
    const parts = fullId.split(':');
    const mainId = parts[0];
    const season = parts[1];
    const episode = parts[2];

    let metaData = {
        id: fullId,
        name: "جاري السحب من Kitsu...",
        poster: "https://via.placeholder.com/300x450?text=Kitsu+Loading",
        info: (episode) ? `حلقة ${episode}` : "فيلم أنمي",
        timestamp: Date.now()
    };

    try {
        // تنظيف المعرف لاستخدامه في Kitsu
        const kitsuId = mainId.replace('kitsu:', '');

        // 1. طلب بيانات الأنمي من Kitsu مباشرة
        const kitsuUrl = `https://kitsu.io/api/edge/anime/${kitsuId}`;
        const response = await axios.get(kitsuUrl, { timeout: 8000 });

        if (response.data && response.data.data) {
            const anime = response.data.data.attributes;
            
            // الاسم الأساسي
            metaData.name = anime.canonicalTitle || anime.titles.en_jp || "عنوان غير معروف";
            
            // البوستر الأساسي (في حال لم نجد صورة للحلقة)
            metaData.poster = anime.posterImage.large || anime.posterImage.original;

            // 2. إذا كان المطلوب حلقة محددة، نسحب بياناتها فوراً
            if (episode) {
                const epUrl = `https://kitsu.io/api/edge/anime/${kitsuId}/episodes?filter[number]=${episode}`;
                const epResponse = await axios.get(epUrl, { timeout: 6000 });

                if (epResponse.data && epResponse.data.data.length > 0) {
                    const epAttr = epResponse.data.data[0].attributes;
                    
                    // تحديث الاسم ليشمل عنوان الحلقة من Kitsu
                    if (epAttr.canonicalTitle) {
                        metaData.name = `${metaData.name} - ${epAttr.canonicalTitle}`;
                    }

                    // تحديث الصورة لتكون صورة الحلقة (Thumbnail) وهي الأهم
                    if (epAttr.thumbnail && epAttr.thumbnail.original) {
                        metaData.poster = epAttr.thumbnail.original;
                    }
                }
            }
        }
    } catch (err) {
        console.error("Kitsu Fetch Error for ID: " + fullId, err.message);
        // في حال الفشل التام نستخدم محرك احتياطي بسيط لكي لا تبقى فارغة
        if (mainId.startsWith('tt')) {
            metaData.name = "محتوى IMDb: " + mainId;
            metaData.poster = `https://images.metahub.space/poster/medium/${mainId}/img`;
        }
    }
    return metaData;
}

// --- معالج الترجمة (Subtitle Handler) ---
builder.defineSubtitlesHandler(async (args) => {
    // تشغيل جلب البيانات في الخلفية لتحديث السجل
    getFullMeta(args.type, args.id).then(meta => {
        // منع التكرار وتحديث الترتيب
        history = [meta, ...history.filter(h => h.id !== args.id)].slice(0, 50);
        saveData();
    });

    const matchedSubs = db.filter(s => s.id === args.id).map(s => ({
        id: s.url,
        url: s.url,
        lang: "ara",
        label: s.label || "ترجمة عبدالله"
    }));

    return { subtitles: matchedSubs };
});

// --- واجهة المستخدم الاحترافية ---
const CSS_STYLE = `
<style>
    @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;700&display=swap');
    :root { --primary: #00d2ff; --bg: #050a14; --card: #111b2d; --accent: #ff0055; }
    body { background: var(--bg); color: #fff; font-family: 'Cairo', sans-serif; direction: rtl; margin: 0; padding: 0; }
    .nav { background: var(--card); padding: 25px 5%; border-bottom: 5px solid var(--primary); display: flex; justify-content: space-between; align-items: center; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
    .container { max-width: 1200px; margin: 40px auto; padding: 0 20px; display: grid; grid-template-columns: 1.8fr 1fr; gap: 40px; }
    .main-card { background: var(--card); border-radius: 20px; padding: 30px; border: 1px solid rgba(255,255,255,0.05); }
    .item-box { display: flex; background: rgba(255,255,255,0.03); border-radius: 15px; overflow: hidden; margin-bottom: 25px; border: 1px solid transparent; transition: 0.4s; }
    .item-box:hover { border-color: var(--primary); transform: translateY(-5px); background: rgba(255,255,255,0.07); }
    .item-box img { width: 160px; height: 230px; object-fit: cover; }
    .item-content { padding: 25px; flex-grow: 1; display: flex; flex-direction: column; justify-content: center; }
    .item-title { font-size: 22px; font-weight: bold; color: var(--primary); margin-bottom: 15px; }
    .tag { background: var(--accent); color: white; padding: 5px 15px; border-radius: 8px; font-size: 14px; width: fit-content; }
    .btn-action { background: linear-gradient(45deg, var(--primary), #3a7bd5); color: white; padding: 12px 25px; border-radius: 10px; text-decoration: none; font-weight: bold; margin-top: 20px; display: inline-block; text-align: center; border: none; cursor: pointer; }
    input { width: 100%; padding: 15px; margin: 15px 0; border-radius: 10px; border: 2px solid #1e293b; background: #050a14; color: white; font-size: 16px; }
    .sidebar-card { background: var(--card); border-radius: 20px; padding: 25px; position: sticky; top: 20px; }
    @media (max-width: 900px) { .container { grid-template-columns: 1fr; } .item-box { flex-direction: column; } .item-box img { width: 100%; height: 250px; } }
</style>
`;

const buildLayout = (body) => `
<!DOCTYPE html>
<html lang="ar">
<head>
    <meta charset="UTF-8">
    <title>Abdullah Kitsu Engine</title>
    ${CSS_STYLE}
</head>
<body>
    <div class="nav">
        <h1 style="margin:0; font-size:28px;">عبدالله <span style="color:var(--primary)">KITSU</span> PRO</h1>
        <div>
            <a href="/" style="color:#fff; text-decoration:none; margin-left:20px;">الرئيسية</a>
            <a href="/admin" style="color:var(--primary); text-decoration:none;">الإدارة (${db.length})</a>
        </div>
    </div>
    <div class="container">${body}</div>
</body>
</html>
`;

// --- المسارات الرئيسية ---

app.get('/', (req, res) => {
    let list = history.map(item => `
        <div class="item-box">
            <img src="${item.poster}" onerror="this.src='https://via.placeholder.com/160x230?text=No+Kitsu+Image'">
            <div class="item-content">
                <div class="item-title">${item.name}</div>
                <div class="tag">${item.info}</div>
                <a href="/upload-page/${encodeURIComponent(item.id)}" class="btn-action">إضافة ترجمة لهذه الحلقة 📁</a>
            </div>
        </div>
    `).join('');

    const sidebar = `
        <div class="sidebar-card">
            <h3 style="color:var(--primary); margin-top:0;">🔗 تثبيت الإضافة</h3>
            <p style="font-size:14px; color:#94a3b8;">انسخ الرابط وضعه في ستريميو:</p>
            <input type="text" value="https://${req.get('host')}/manifest.json" readonly onclick="this.select()">
            <a href="stremio://${req.get('host')}/manifest.json" class="btn-action" style="width:100%; box-sizing:border-box;">تثبيت مباشر</a>
            <div style="margin-top:30px; padding:15px; background:rgba(0,0,0,0.2); border-radius:10px; font-size:13px; color:#888;">
                تنبيه: الكود يعتمد على Kitsu بشكل رئيسي لضمان ظهور صور الحلقات والأسماء بشكل صحيح.
            </div>
        </div>
    `;

    res.send(buildLayout(`
        <div class="main-card">
            <h2 style="margin-bottom:30px;">🎬 آخر الحلقات المشاهدة (Kitsu)</h2>
            ${list || '<div style="text-align:center; padding:50px; opacity:0.5;">لم يتم رصد أي نشاط من ستريميو بعد...</div>'}
        </div>
        ${sidebar}
        <script>setTimeout(()=> { if(window.location.pathname==='/') location.reload(); }, 10000);</script>
    `));
});

app.get('/upload-page/:id', (req, res) => {
    const target = history.find(h => h.id === req.params.id);
    res.send(buildLayout(`
        <div class="main-card" style="grid-column: span 2; max-width:700px; margin:auto; width:100%;">
            <h2 style="color:var(--primary)">رفع ترجمة لـ: ${target ? target.name : 'محتوى غير معروف'}</h2>
            <form action="/upload" method="POST" enctype="multipart/form-data">
                <input type="hidden" name="imdbId" value="${req.params.id}">
                <p>اختر ملف SRT:</p>
                <input type="file" name="subFile" accept=".srt" required>
                <p>اسم المترجم أو الإصدار:</p>
                <input type="text" name="label" placeholder="مثلاً: ترجمة عبدالله - BluRay">
                <button type="submit" class="btn-action" style="width:100%">نشر الترجمة فوراً ✅</button>
            </form>
            <br><a href="/" style="color:#94a3b8; display:block; text-align:center;">إلغاء والعودة</a>
        </div>
    `));
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
    let rows = db.map((s, i) => `
        <div class="item-box" style="padding:20px; align-items:center;">
            <div style="flex-grow:1">
                <div style="font-weight:bold; font-size:18px;">${s.label}</div>
                <div style="color:#64748b; font-size:12px;">ID: ${s.id}</div>
            </div>
            <a href="/delete/${i}" class="btn-action" style="background:var(--accent); margin-top:0;">حذف</a>
        </div>
    `).join('');
    res.send(buildLayout(`<div class="main-card" style="grid-column: span 2;"><h2>📂 الملفات المرفوعة</h2>${rows || 'لا توجد ملفات حالياً'}<br><a href="/" class="btn-action">رجوع</a></div>`));
});

app.get('/delete/:index', (req, res) => {
    const target = db[req.params.index];
    if (target) {
        try { fs.unlinkSync(path.join(SUB_DIR, target.filename)); } catch(e) {}
        db.splice(req.params.index, 1);
        saveData();
    }
    res.redirect('/admin');
});

// --- تشغيل السيرفر ---
app.get('/manifest.json', (req, res) => res.json(manifest));
app.get('/subtitles/:type/:id/:extra?.json', async (req, res) => {
    const result = await builder.getInterface().get('subtitles', req.params.type, req.params.id);
    res.json(result);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`\n\x1b[36m%s\x1b[0m`, `[Abdullah System] Kitsu Engine Is Running on Port: ${PORT}`);
});
