const express = require('express');
const { addonBuilder } = require('stremio-addon-sdk');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cors = require('cors');

const app = express();

// --- [1] إعدادات المجلدات وقواعد البيانات ---
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
    id: "org.abdullah.full.v15",
    version: "15.0.0",
    name: "Abdullah Ultimate Pro Max",
    description: "النظام المتكامل لجلب الصور والأسماء ورفع الترجمات",
    resources: ["subtitles"],
    types: ["movie", "series", "anime"],
    idPrefixes: ["tt", "kitsu"],
    catalogs: [] 
};

const builder = new addonBuilder(manifest);

// --- [4] معالج الطلبات وجلب البيانات الذكي ---
builder.defineSubtitlesHandler(async (args) => {
    const fullId = args.id;
    const cleanId = fullId.split(':')[0];
    const parts = fullId.split(':');
    const season = parts[1];
    const episode = parts[2];

    // التسجيل الفوري في التاريخ لضمان ظهوره في الموقع
    let existingEntry = history.find(h => h.id === fullId);
    if (!existingEntry) {
        const newEntry = {
            id: fullId,
            name: "جاري تحديث البيانات...", 
            poster: `https://images.metahub.space/poster/medium/${cleanId}/img`,
            type: args.type,
            time: new Date().toLocaleTimeString('ar-SA')
        };
        history = [newEntry, ...history].slice(0, 30);
        saveData();
    }

    // جلب البيانات العميقة (Deep Meta) في الخلفية
    updateFullMeta(args.type, fullId, cleanId, season, episode);

    // عرض الترجمات المرفوعة لهذا الـ ID
    const foundSubs = db.filter(s => s.id === fullId).map(s => ({
        id: s.url,
        url: s.url,
        lang: "ara",
        label: s.label || "ترجمة عبدالله"
    }));

    return { subtitles: foundSubs };
});

async function updateFullMeta(type, fullId, cleanId, s, e) {
    try {
        let finalName = "";
        let finalPoster = "";

        // جلب من Cinemeta للمسلسلات والأفلام
        if (cleanId.startsWith('tt')) {
            const res = await axios.get(`https://v3-cinemeta.strem.io/meta/${type}/${cleanId}.json`);
            if (res.data && res.data.meta) {
                const meta = res.data.meta;
                if (type === 'series' && s && e) {
                    const ep = meta.videos?.find(v => v.season == s && v.number == e);
                    finalName = `${meta.name} - S${s}E${e} ${ep && ep.title ? '- ' + ep.title : ''}`;
                    finalPoster = (ep && ep.thumbnail) ? ep.thumbnail : meta.poster;
                } else {
                    finalName = meta.name;
                    finalPoster = meta.poster;
                }
            }
        } 
        // جلب من Kitsu للأنمي
        else if (cleanId.startsWith('kitsu')) {
            const kitsuId = cleanId.replace('kitsu:', '');
            const kRes = await axios.get(`https://kitsu.io/api/edge/anime/${kitsuId}`);
            if (kRes.data && kRes.data.data) {
                const attr = kRes.data.data.attributes;
                finalName = attr.canonicalTitle;
                finalPoster = attr.posterImage.medium;

                if (e) {
                    try {
                        const epRes = await axios.get(`https://kitsu.io/api/edge/anime/${kitsuId}/episodes?filter[number]=${e}`);
                        if (epRes.data && epRes.data.data[0]) {
                            const epAttr = epRes.data.data[0].attributes;
                            finalName += ` - الحلقة ${e} ${epAttr.canonicalTitle ? '(' + epAttr.canonicalTitle + ')' : ''}`;
                            if (epAttr.thumbnail) finalPoster = epAttr.thumbnail.original;
                        } else { finalName += ` - الحلقة ${e}`; }
                    } catch (err) { finalName += ` - الحلقة ${e}`; }
                }
            }
        }

        if (finalName) {
            history = history.map(h => h.id === fullId ? { ...h, name: finalName, poster: finalPoster } : h);
            saveData();
        }
    } catch (e) { console.log("Error fetching meta for " + fullId); }
}

// --- [5] واجهة المستخدم الاحترافية ---
const CSS = `
<style>
    :root { --bg: #0f172a; --card: #1e293b; --accent: #38bdf8; --text: #f1f5f9; --danger: #f43f5e; }
    body { background: var(--bg); color: var(--text); font-family: 'Segoe UI', system-ui, sans-serif; margin: 0; direction: rtl; }
    .navbar { background: var(--card); padding: 20px 50px; display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid var(--accent); box-shadow: 0 4px 15px rgba(0,0,0,0.3); }
    .container { max-width: 1200px; margin: 40px auto; padding: 0 20px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(350px, 1fr)); gap: 25px; }
    .card { background: var(--card); border-radius: 15px; overflow: hidden; display: flex; border: 1px solid #334155; transition: 0.3s; height: 150px; }
    .card:hover { transform: translateY(-5px); border-color: var(--accent); box-shadow: 0 10px 20px rgba(0,0,0,0.2); }
    .card img { width: 100px; height: 100%; object-fit: cover; background: #000; }
    .card-content { padding: 15px; display: flex; flex-direction: column; justify-content: space-between; flex: 1; }
    .title { color: var(--accent); font-weight: bold; font-size: 1.1rem; margin-bottom: 5px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .btn { background: var(--accent); color: #0f172a; padding: 10px 20px; border-radius: 8px; text-decoration: none; font-weight: bold; text-align: center; border: none; cursor: pointer; transition: 0.2s; }
    .btn:hover { opacity: 0.9; transform: scale(1.02); }
    .btn-danger { background: var(--danger); color: white; }
    .sidebar { background: var(--card); padding: 25px; border-radius: 15px; margin-bottom: 30px; border: 1px solid #334155; }
    input { background: #0f172a; border: 1px solid #334155; color: white; padding: 12px; border-radius: 8px; width: 100%; box-sizing: border-box; margin-top: 10px; }
</style>
`;

app.get('/', (req, res) => {
    let cards = history.map(h => `
        <div class="card">
            <img src="${h.poster}" onerror="this.src='https://via.placeholder.com/100x150?text=No+Image'">
            <div class="card-content">
                <div>
                    <div class="title">${h.name}</div>
                    <code style="font-size: 0.75rem; color: #94a3b8;">${h.id}</code>
                </div>
                <a href="/upload-page/${encodeURIComponent(h.id)}" class="btn">رفع ترجمة</a>
            </div>
        </div>
    `).join('');

    res.send(`<html><head><title>لوحة التحكم</title>${CSS}</head><body>
        <div class="navbar">
            <h1 style="margin:0; font-size:1.5rem;">Abdullah Pro Max 🚀</h1>
            <a href="/admin" style="color:var(--accent); text-decoration:none; font-weight:bold;">إدارة الملفات 📁</a>
        </div>
        <div class="container">
            <div class="sidebar">
                <h3 style="margin-top:0;">📡 إضافة ستريميو</h3>
                <p style="font-size:0.9rem; color:#94a3b8;">انسخ الرابط التالي وأضفه في ستريميو:</p>
                <input value="https://${req.get('host')}/manifest.json" readonly onclick="this.select()">
                <div style="margin-top:15px; font-size:0.8rem; color:var(--accent);">سيتم تحديث الصفحة تلقائياً عند مشاهدة أي شيء جديد.</div>
            </div>
            <h2 style="margin-bottom:20px;">📺 السجل الأخير</h2>
            <div class="grid">${cards || '<p style="text-align:center; grid-column: 1/-1;">لا توجد بيانات حالياً. ابدأ بمشاهدة شيء في ستريميو!</p>'}</div>
        </div>
        <script>setTimeout(()=>location.reload(), 10000);</script>
    </body></html>`);
});

// صفحة الرفع المخصصة
app.get('/upload-page/:id', (req, res) => {
    const item = history.find(h => h.id === req.params.id);
    res.send(`<html><head>${CSS}</head><body>
        <div class="container" style="max-width:500px; margin-top:100px;">
            <div class="sidebar">
                <h2 style="color:var(--accent)">رفع ترجمة جديدة</h2>
                <p>للعمل: <b>${item ? item.name : req.params.id}</b></p>
                <form action="/upload" method="POST" enctype="multipart/form-data">
                    <input type="hidden" name="id" value="${req.params.id}">
                    <div style="margin:20px 0;">
                        <label>اختر ملف SRT:</label>
                        <input type="file" name="sub" accept=".srt" required>
                    </div>
                    <div style="margin:20px 0;">
                        <label>اسم المترجم أو النسخة:</label>
                        <input type="text" name="label" placeholder="مثلاً: ترجمة عبدالله" required>
                    </div>
                    <button type="submit" class="btn" style="width:100%">نشر الآن ✅</button>
                </form>
                <br><a href="/" style="color:#94a3b8; text-decoration:none; display:block; text-align:center;">إلغاء والرجوع</a>
            </div>
        </div>
    </body></html>`);
});

// صفحة الإدارة
app.get('/admin', (req, res) => {
    let rows = db.map((s, i) => `
        <div class="card" style="height:auto; padding:15px; margin-bottom:15px; align-items:center;">
            <div style="flex-grow:1">
                <div style="color:var(--accent); font-weight:bold;">${s.label}</div>
                <div style="font-size:0.8rem; color:#94a3b8;">ID: ${s.id}</div>
            </div>
            <a href="/delete/${i}" class="btn btn-danger" onclick="return confirm('هل أنت متأكد؟')">حذف</a>
        </div>
    `).join('');

    res.send(`<html><head>${CSS}</head><body>
        <div class="navbar"><h1>إدارة الملفات المرفوعة</h1><a href="/" class="btn">الرئيسية</a></div>
        <div class="container" style="max-width:800px;">
            ${rows || '<p style="text-align:center;">لا توجد ملفات مرفوعة حالياً.</p>'}
        </div>
    </body></html>`);
});

// --- [6] المسارات اللوجستية (رفع، حذف، مانيفت) ---
app.post('/upload', upload.single('sub'), (req, res) => {
    if (req.file) {
        db.push({ 
            id: req.body.id, 
            url: `https://${req.get('host')}/download/${req.file.filename}`, 
            label: req.body.label || "ترجمة عبدالله",
            filename: req.file.filename 
        });
        saveData();
    }
    res.redirect('/');
});

app.get('/delete/:i', (req, res) => {
    const s = db[req.params.i];
    if (s && s.filename) {
        try { fs.unlinkSync(path.join(SUB_DIR, s.filename)); } catch(e) {}
    }
    db.splice(req.params.i, 1);
    saveData();
    res.redirect('/admin');
});

app.get('/manifest.json', (req, res) => res.json(manifest));
app.get('/subtitles/:type/:id/:extra?.json', (req, res) => {
    builder.getInterface().get('subtitles', req.params.type, req.params.id)
        .then(r => res.json(r))
        .catch(() => res.json({ subtitles: [] }));
});

// تشغيل السيرفر
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Abdullah Ultimate Pro Max is active on port ${PORT}`));
