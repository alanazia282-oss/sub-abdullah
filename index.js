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
    id: "org.abdullah.kitsu.full.v7",
    version: "7.0.0",
    name: "Abdullah Kitsu & Cinema System",
    description: "النظام المتكامل لجلب بيانات Kitsu و Cinemeta بدقة عالية مع رفع الترجمات",
    resources: ["subtitles"],
    types: ["movie", "series", "anime"],
    idPrefixes: ["tt", "kitsu"],
    catalogs: []
};

const builder = new addonBuilder(manifest);

// --- محرك الميتا المطور لجلب الصور والأسماء من Kitsu و Cinemeta ---
async function getFullMeta(type, fullId) {
    const parts = fullId.split(':');
    const mainId = parts[0];
    const season = parts[1];
    const episode = parts[2];

    let metaData = {
        id: fullId,
        name: "جاري البحث في المصادر...",
        poster: `https://images.metahub.space/poster/medium/${mainId}/img`,
        info: (episode) ? `حلقة ${episode}` : "فيلم/عمل",
        timestamp: Date.now()
    };

    try {
        // التحقق إذا كان المحتوى أنمي (Kitsu)
        if (mainId.startsWith('kitsu') || type === 'anime') {
            const kId = mainId.replace('kitsu:', '');
            
            // 1. جلب بيانات الأنمي الأساسية
            const kRes = await axios.get(`https://kitsu.io/api/edge/anime/${kId}`, { timeout: 5000 });
            if (kRes.data && kRes.data.data) {
                const attr = kRes.data.data.attributes;
                metaData.name = attr.canonicalTitle || attr.titles.en_jp;
                metaData.poster = attr.posterImage.large || attr.posterImage.original;

                // 2. محاولة جلب صورة الحلقة واسم الحلقة تحديداً
                if (episode) {
                    try {
                        const epRes = await axios.get(`https://kitsu.io/api/edge/anime/${kId}/episodes?filter[number]=${episode}`, { timeout: 4000 });
                        if (epRes.data && epRes.data.data.length > 0) {
                            const epAttr = epRes.data.data[0].attributes;
                            if (epAttr.canonicalTitle) {
                                metaData.name = `${metaData.name} - ${epAttr.canonicalTitle}`;
                            }
                            if (epAttr.thumbnail && epAttr.thumbnail.original) {
                                metaData.poster = epAttr.thumbnail.original;
                            }
                        }
                    } catch (e) { console.log("Episode meta not found on Kitsu"); }
                }
            }
        } 
        // المحتوى العادي (Cinemeta / IMDb)
        else {
            const cRes = await axios.get(`https://v3-cinemeta.strem.io/meta/${type}/${mainId}.json`, { timeout: 5000 });
            if (cRes.data && cRes.data.meta) {
                const m = cRes.data.meta;
                metaData.name = m.name;
                if (type === 'series' && season) {
                    const epEntry = m.videos?.find(v => v.season == season && v.number == episode);
                    metaData.poster = epEntry?.thumbnail || m.poster;
                    if (epEntry?.title) metaData.name += ` - ${epEntry.title}`;
                } else {
                    metaData.poster = m.poster;
                }
            }
        }
    } catch (err) {
        console.error("Meta fetch error for " + fullId);
    }
    return metaData;
}

// --- معالج الترجمة (Subtitle Handler) ---
builder.defineSubtitlesHandler(async (args) => {
    // تحديث السجل في الخلفية عند الطلب من ستريميو
    getFullMeta(args.type, args.id).then(meta => {
        history = [meta, ...history.filter(h => h.id !== args.id)].slice(0, 40);
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

// --- قوالب واجهة المستخدم (التصميم الكامل) ---
const UI_STYLE = `
<style>
    :root { --primary: #3b82f6; --bg: #0f172a; --card: #1e293b; --text: #f1f5f9; }
    body { background: var(--bg); color: var(--text); font-family: 'Cairo', sans-serif; direction: rtl; margin: 0; padding: 0; }
    .header { background: var(--card); padding: 20px 5%; border-bottom: 4px solid var(--primary); display: flex; justify-content: space-between; align-items: center; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); }
    .container { max-width: 1100px; margin: 30px auto; padding: 0 15px; display: grid; grid-template-columns: 2fr 1fr; gap: 25px; }
    .card { background: var(--card); border-radius: 12px; padding: 25px; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.2); }
    .item-card { display: flex; background: #334155; border-radius: 10px; overflow: hidden; margin-bottom: 20px; transition: 0.3s transform; }
    .item-card:hover { transform: scale(1.02); }
    .item-card img { width: 130px; height: 190px; object-fit: cover; border-left: 2px solid var(--primary); }
    .item-info { padding: 20px; flex-grow: 1; position: relative; }
    .badge { background: #10b981; color: white; padding: 5px 15px; border-radius: 30px; font-size: 13px; font-weight: bold; }
    .btn { background: var(--primary); color: white; padding: 12px 25px; border-radius: 8px; text-decoration: none; font-weight: bold; display: inline-block; transition: 0.3s opacity; border: none; cursor: pointer; }
    .btn:hover { opacity: 0.9; }
    .btn-del { background: #ef4444; margin-right: 10px; }
    input, select { width: 100%; padding: 12px; margin: 10px 0; border-radius: 6px; border: 1px solid #475569; background: #1e293b; color: white; box-sizing: border-box; }
    @media (max-width: 800px) { .container { grid-template-columns: 1fr; } }
</style>
`;

const getLayout = (content) => `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>نظام عبدالله المتكامل</title>
    ${UI_STYLE}
</head>
<body>
    <div class="header">
        <h1>لوحة التحكم 🚀</h1>
        <div>
            <a href="/" style="color:white; margin-left:20px; text-decoration:none;">الرئيسية</a>
            <a href="/admin" style="color:#94a3b8; text-decoration:none;">الإدارة (${db.length})</a>
        </div>
    </div>
    <div class="container">${content}</div>
</body>
</html>
`;

// --- المسارات (Routes) ---

app.get('/', (req, res) => {
    let historyHtml = history.map(h => `
        <div class="item-card">
            <img src="${h.poster}" onerror="this.src='https://via.placeholder.com/130x190?text=No+Image'">
            <div class="item-info">
                <div style="font-size: 20px; font-weight: bold; margin-bottom: 10px;">${h.name}</div>
                <span class="badge">${h.info}</span><br><br><br>
                <a href="/upload-page/${encodeURIComponent(h.id)}" class="btn">إضافة ترجمة ➕</a>
            </div>
        </div>
    `).join('');

    const sidebar = `
        <div class="card">
            <h3>⚙️ الإعدادات</h3>
            <p>رابط الإضافة الخاص بك:</p>
            <input type="text" value="https://${req.get('host')}/manifest.json" readonly onclick="this.select()">
            <a href="stremio://${req.get('host')}/manifest.json" class="btn" style="width:100%; text-align:center; box-sizing:border-box;">تثبيت في ستريميو</a>
            <p style="font-size: 12px; color: #94a3b8; margin-top: 20px;">* يتم تحديث القائمة تلقائياً عند تشغيل أي فيديو في ستريميو.</p>
        </div>
    `;

    res.send(getLayout(`
        <div class="card">
            <h3>📽️ آخر ما تم طلبه (دعم Kitsu)</h3>
            ${historyHtml || '<p style="text-align:center; padding:40px; color:#64748b;">لا توجد بيانات حالياً. شغل شيئاً في ستريميو!</p>'}
        </div>
        ${sidebar}
        <script>setTimeout(()=> { if(window.location.pathname === '/') window.location.reload(); }, 7000);</script>
    `));
});

app.get('/upload-page/:id', (req, res) => {
    const item = history.find(h => h.id === req.params.id);
    res.send(getLayout(`
        <div class="card" style="grid-column: span 2; max-width: 600px; margin: auto;">
            <h3>رفع ملف ترجمة جديد</h3>
            <p>أنت ترفع لـ: <strong style="color:var(--primary)">${item ? item.name : req.params.id}</strong></p>
            <hr style="border-color:#334155; margin: 20px 0;">
            <form action="/upload" method="POST" enctype="multipart/form-data">
                <input type="hidden" name="imdbId" value="${req.params.id}">
                <label>ملف الترجمة (SRT):</label>
                <input type="file" name="subFile" accept=".srt" required>
                <label>اسم المترجم أو الفريق:</label>
                <input type="text" name="label" placeholder="مثال: ترجمة عبدالله - BluRay">
                <button type="submit" class="btn" style="width:100%; margin-top:15px;">اعتماد ونشر ✅</button>
            </form>
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
        <div class="item-card" style="padding:15px; margin-bottom:10px; align-items:center;">
            <div style="flex-grow:1;">
                <strong>${s.label}</strong><br>
                <small style="color:#94a3b8;">ID: ${s.id}</small>
            </div>
            <a href="/delete/${i}" class="btn btn-del">حذف</a>
        </div>
    `).join('');

    res.send(getLayout(`
        <div class="card" style="grid-column: span 2;">
            <h3>📂 إدارة الملفات المرفوعة</h3>
            ${rows || '<p>لا توجد ملفات مرفوعة حتى الآن.</p>'}
            <br>
            <a href="/" class="btn">العودة للرئيسية</a>
        </div>
    `));
});

app.get('/delete/:index', (req, res) => {
    const sub = db[req.params.index];
    if (sub) {
        try { fs.unlinkSync(path.join(SUB_DIR, sub.filename)); } catch(e) {}
        db.splice(req.params.index, 1);
        saveData();
    }
    res.redirect('/admin');
});

// --- تشغيل الإضافة (Addon Startup) ---
app.get('/manifest.json', (req, res) => res.json(manifest));
app.get('/subtitles/:type/:id/:extra?.json', async (req, res) => {
    const r = await builder.getInterface().get('subtitles', req.params.type, req.params.id);
    res.json(r);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`=========================================`);
    console.log(`  نظام عبدالله جاهز الآن على المنفذ: ${PORT}  `);
    console.log(`=========================================`);
});
