const express = require('express');
const { addonBuilder } = require('stremio-addon-sdk');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cors = require('cors');

const app = express();

// --- إعداد المسارات وقواعد البيانات ---
const DATA_DIR = path.join(__dirname, 'data');
const SUB_DIR = path.join(__dirname, 'subtitles');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
if (!fs.existsSync(SUB_DIR)) fs.mkdirSync(SUB_DIR);

const DB_FILE = path.join(DATA_DIR, 'db.json');
const HISTORY_FILE = path.join(DATA_DIR, 'history.json');

let db = fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE)) : [];
let history = fs.existsSync(HISTORY_FILE) ? JSON.parse(fs.readFileSync(HISTORY_FILE)) : [];

const saveData = () => {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
        fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
    } catch (e) { console.error("خطأ في حفظ البيانات:", e); }
};

const upload = multer({ dest: 'subtitles/' });
app.use(cors());
app.use(express.json());
app.use('/download', express.static('subtitles'));

// --- Stremio Manifest ---
const manifest = {
    id: "org.abdullah.ultimate.v1",
    version: "1.5.0",
    name: "Abdullah Pro Subtitles",
    description: "نظام عبدالله المتكامل للترجمة - يدعم البوسترات والحلقات",
    resources: ["subtitles"],
    types: ["movie", "series", "anime"],
    idPrefixes: ["tt", "kitsu"]
};

const builder = new addonBuilder(manifest);

// --- محرك جلب المعلومات المتطور ---
builder.defineSubtitlesHandler(async (args) => {
    const fullId = args.id;
    const parts = fullId.split(':');
    const cleanId = parts[0];

    let entry = history.find(h => h.id === fullId);
    
    if (!entry) {
        let title = "جاري البحث...";
        let poster = `https://images.metahub.space/poster/medium/${cleanId}/img`;
        let seasonInfo = "";

        // تحديد الموسم والحلقة
        if (args.type === 'series' && parts[1]) {
            seasonInfo = `الموسم ${parts[1]} - الحلقة ${parts[2]}`;
        } else if (args.type === 'anime' && parts[1]) {
            seasonInfo = `الحلقة ${parts[1]}`;
        }

        try {
            // جلب البيانات من Cinemeta لضمان الاسم والبوستر
            const res = await axios.get(`https://v3-cinemeta.strem.io/meta/${args.type}/${cleanId}.json`, { timeout: 3000 });
            if (res.data && res.data.meta) {
                const meta = res.data.meta;
                title = meta.name;
                // جلب بوستر الحلقة لو كان مسلسل
                if (args.type === 'series' && parts[1]) {
                    const ep = meta.videos?.find(v => v.season == parts[1] && v.number == parts[2]);
                    if (ep && ep.thumbnail) poster = ep.thumbnail;
                    else poster = meta.poster || poster;
                } else {
                    poster = meta.poster || poster;
                }
            }
        } catch (e) { console.log("خطأ في جلب بيانات الميتا"); }

        entry = { id: fullId, name: title, poster, seasonInfo, type: args.type, time: new Date().toLocaleString('ar-SA') };
        history = [entry, ...history].slice(0, 20);
        saveData();
    }

    const subs = db.filter(s => s.id === fullId).map(s => ({
        id: s.url,
        url: s.url,
        lang: "ara",
        label: s.label || "ترجمة عبدالله"
    }));

    return { subtitles: subs };
});

// --- الواجهة الرسومية الكاملة (التصميم الضخم) ---
const style = `
<style>
    :root { --main-bg: #0f172a; --card-bg: #1e293b; --accent: #e11d48; --text: #f1f5f9; }
    body { background: var(--main-bg); color: var(--text); font-family: 'Segoe UI', Tahoma, sans-serif; margin: 0; direction: rtl; }
    .nav { background: var(--card-bg); padding: 1rem 5%; border-bottom: 4px solid var(--accent); display: flex; justify-content: space-between; align-items: center; }
    .container { max-width: 1200px; margin: 30px auto; padding: 0 20px; display: grid; grid-template-columns: 2fr 1fr; gap: 30px; }
    .card { background: var(--card-bg); border-radius: 15px; padding: 25px; box-shadow: 0 10px 25px rgba(0,0,0,0.4); }
    .item-list { display: flex; flex-direction: column; gap: 15px; }
    .item-row { display: flex; align-items: center; background: #334155; padding: 15px; border-radius: 12px; border-right: 6px solid var(--accent); transition: 0.3s; }
    .item-row:hover { transform: scale(1.02); }
    .poster { width: 80px; height: 115px; border-radius: 8px; object-fit: cover; margin-left: 20px; box-shadow: 0 5px 15px rgba(0,0,0,0.5); }
    .info { flex-grow: 1; }
    .info h4 { margin: 0 0 5px 0; font-size: 1.2rem; }
    .season-text { color: #fbbf24; font-weight: bold; font-size: 0.9rem; }
    .btn { background: var(--accent); color: white; padding: 10px 20px; border-radius: 8px; text-decoration: none; font-weight: bold; display: inline-block; border: none; cursor: pointer; }
    .badge-id { display: block; font-size: 0.75rem; color: #94a3b8; margin-top: 8px; }
    input { width: 100%; padding: 12px; border-radius: 8px; border: 1px solid #475569; background: #0f172a; color: white; margin-top: 10px; }
    .admin-link { color: #38bdf8; text-decoration: none; font-size: 0.9rem; }
</style>
`;

app.get('/', (req, res) => {
    let listHtml = history.map(h => `
        <div class="item-row">
            <img src="${h.poster}" class="poster" onerror="this.src='https://via.placeholder.com/80x115?text=No+Img'">
            <div class="info">
                <h4>${h.name}</h4>
                <span class="season-text">${h.seasonInfo || (h.type === 'movie' ? 'فيلم' : '')}</span>
                <span class="badge-id">ID: ${h.id}</span>
            </div>
            <a href="/upload-page/${encodeURIComponent(h.id)}" class="btn">رفع ترجمة</a>
        </div>
    `).join('');

    res.send(`${style}
        <div class="nav">
            <h1>Abdullah Pro System</h1>
            <a href="/admin" class="admin-link">📂 الملفات المرفوعة (${db.length})</a>
        </div>
        <div class="container">
            <div class="card">
                <h2 style="margin-top:0;">📡 السجل المباشر (ستريميو)</h2>
                <div class="item-list">${listHtml || '<p style="text-align:center; color:#64748b;">شغل أي حلقة في ستريميو لتظهر هنا فوراً...</p>'}</div>
            </div>
            <div class="card">
                <h3>⚙️ التحكم بالإضافة</h3>
                <p>رابط المانيفست الخاص بك:</p>
                <input readonly value="https://${req.get('host')}/manifest.json">
                <br><br>
                <a href="stremio://${req.get('host')}/manifest.json" class="btn" style="width:100%; text-align:center; box-sizing: border-box;">تثبيت الإضافة</a>
                <hr style="border:0; border-top:1px solid #475569; margin:25px 0;">
                <p style="font-size:0.8rem; color:#94a3b8;">* النظام يراقب طلبات ستريميو ويجلب البوسترات تلقائياً.</p>
            </div>
        </div>
        <script>setTimeout(()=>location.reload(), 15000);</script>
    `);
});

// --- مسارات الرفع والإدارة ---
app.get('/upload-page/:id', (req, res) => {
    const item = history.find(h => h.id === req.params.id);
    res.send(`${style}<div class="card" style="max-width:500px; margin:80px auto;">
        <h2>رفع ترجمة لـ: ${item ? item.name : 'عمل غير معروف'}</h2>
        <p class="season-text">${item ? item.seasonInfo : ''}</p>
        <form action="/upload" method="POST" enctype="multipart/form-data">
            <input type="hidden" name="imdbId" value="${req.params.id}">
            <div style="margin:25px 0;">
                <label>اختر ملف SRT:</label><br><br>
                <input type="file" name="subFile" accept=".srt" required>
            </div>
            <button type="submit" class="btn" style="width:100%">تأكيد الرفع على السيرفر ✅</button>
        </form>
        <br><a href="/" style="color:#94a3b8;">إلغاء والرجوع</a>
    </div>`);
});

app.post('/upload', upload.single('subFile'), (req, res) => {
    if (req.file) {
        db.push({ 
            id: req.body.imdbId, 
            url: `https://${req.get('host')}/download/${req.file.filename}`, 
            label: "ترجمة عبدالله الاحترافية" 
        });
        saveData();
    }
    res.redirect('/');
});

app.get('/admin', (req, res) => {
    let list = db.map((s, i) => `
        <div class="item-row">
            <div class="info"><b>ID: ${s.id}</b><br><small>${s.url}</small></div>
            <a href="/delete/${i}" style="color:#ef4444; font-weight:bold;">حذف</a>
        </div>`).join('');
    res.send(`${style}<div class="container" style="grid-template-columns: 1fr;">
        <div class="card">
            <h2>📁 إدارة الترجمات المرفوعة</h2>
            ${list || '<p>لا توجد ملفات حالياً.</p>'}
            <br><a href="/" class="btn">الرجوع للرئيسية</a>
        </div>
    </div>`);
});

app.get('/delete/:index', (req, res) => {
    const fileIndex = req.params.index;
    if (db[fileIndex]) {
        const filePath = path.join(SUB_DIR, path.basename(db[fileIndex].url));
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        db.splice(fileIndex, 1);
        saveData();
    }
    res.redirect('/admin');
});

// --- مسارات تشغيل الإضافة ---
app.get('/manifest.json', (req, res) => res.json(manifest));
app.get('/subtitles/:type/:id/:extra?.json', (req, res) => {
    builder.getInterface().get('subtitles', req.params.type, req.params.id).then(r => res.json(r));
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`🚀 السيرفر الأسطوري يعمل على المنفذ ${port}`));
