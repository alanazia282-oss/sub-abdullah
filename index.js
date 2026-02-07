/**
 * نظام عبدالله المتكامل والنهائي لترجمات ستريميو
 * يدعم: (الأفلام، المسلسلات، الأنمي) مع جلب صور الحلقات والأسماء تلقائياً
 */

const express = require('express');
const { addonBuilder } = require('stremio-addon-sdk');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cors = require('cors');

const app = express();

// --- إعدادات تخزين البيانات ---
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

// إعداد رفع الملفات
const upload = multer({ dest: 'subtitles/' });
app.use(cors());
app.use(express.json());
app.use('/download', express.static('subtitles'));

// --- إعداد الـ Manifest ---
const manifest = {
    id: "org.abdullah.ultimate.v3",
    version: "3.0.0",
    name: "Abdullah Ultimate Subtitles",
    description: "نظام إدارة الترجمة الاحترافي - دعم كامل للحلقات والبوسترات",
    resources: ["subtitles"],
    types: ["movie", "series", "anime"],
    idPrefixes: ["tt", "kitsu"],
    catalogs: [] // مصفوفة فارغة لتجنب أخطاء SDK
};

const builder = new addonBuilder(manifest);

// --- وظيفة ذكية لجلب بيانات الميتا (بوستر الحلقات والأسماء) ---
async function fetchMeta(type, fullId) {
    const [imdbId, season, episode] = fullId.split(':');
    let title = "جاري التعرف...";
    let poster = `https://images.metahub.space/poster/medium/${imdbId}/img`;
    let info = (type === 'series' && season) ? `الموسم ${season} - حلقة ${episode}` : "فيلم";

    try {
        const response = await axios.get(`https://v3-cinemeta.strem.io/meta/${type}/${imdbId}.json`, { timeout: 3000 });
        if (response.data && response.data.meta) {
            const m = response.data.meta;
            title = m.name || title;
            if (type === 'series' && season) {
                const epData = m.videos?.find(v => v.season == season && v.number == episode);
                if (epData && epData.thumbnail) poster = epData.thumbnail;
                else if (m.poster) poster = m.poster;
            } else {
                poster = m.poster || poster;
            }
        }
    } catch (e) { console.log("Meta Fetch Error for: " + imdbId); }

    return { id: fullId, name: title, poster, info, type, timestamp: Date.now() };
}

// --- معالج الترجمات لستريميو ---
builder.defineSubtitlesHandler(async (args) => {
    // التحقق من السجل أولاً للسرعة
    let entry = history.find(h => h.id === args.id);

    // إذا لم يوجد في السجل، نجلبه في الخلفية ليظهر في الزيارة القادمة للوحة التحكم
    if (!entry) {
        fetchMeta(args.type, args.id).then(newEntry => {
            history = [newEntry, ...history.filter(x => x.id !== args.id)].slice(0, 30);
            saveData();
        });
    }

    const matchedSubs = db.filter(s => s.id === args.id).map(s => ({
        id: s.url,
        url: s.url,
        lang: "ara",
        label: s.label || "ترجمة عبدالله"
    }));

    return { subtitles: matchedSubs };
});

// --- الواجهة الرسومية (CSS) ---
const style = `
<style>
    :root { --main: #e11d48; --bg: #0f172a; --card: #1e293b; }
    body { background: var(--bg); color: #f1f5f9; font-family: 'Segoe UI', Tahoma; direction: rtl; margin: 0; padding: 0; }
    .header { background: var(--card); padding: 20px 5%; border-bottom: 4px solid var(--main); display: flex; justify-content: space-between; }
    .container { max-width: 1100px; margin: 20px auto; padding: 15px; display: grid; grid-template-columns: 2fr 1fr; gap: 20px; }
    .card { background: var(--card); border-radius: 12px; padding: 20px; box-shadow: 0 4px 15px rgba(0,0,0,0.4); }
    .item-card { display: flex; align-items: center; background: #334155; padding: 12px; border-radius: 10px; margin-bottom: 12px; transition: 0.3s; }
    .item-card:hover { transform: scale(1.02); }
    .poster { width: 70px; height: 100px; border-radius: 6px; object-fit: cover; margin-left: 15px; background: #000; }
    .info-box { flex-grow: 1; }
    .badge { color: #fbbf24; font-weight: bold; font-size: 0.85rem; }
    .btn { background: var(--main); color: white; padding: 10px 18px; border-radius: 6px; text-decoration: none; font-weight: bold; border: none; cursor: pointer; display: inline-block; }
    input { width: 100%; padding: 10px; border-radius: 6px; border: 1px solid #475569; background: #0f172a; color: white; margin: 10px 0; }
    @media (max-width: 768px) { .container { grid-template-columns: 1fr; } }
</style>
`;

// --- المسارات (Routes) ---

// الصفحة الرئيسية
app.get('/', (req, res) => {
    let items = history.sort((a,b) => b.timestamp - a.timestamp).map(h => `
        <div class="item-card">
            <img src="${h.poster}" class="poster" onerror="this.src='https://via.placeholder.com/70x100?text=NO+IMG'">
            <div class="info-box">
                <div style="font-size: 1.1rem; font-weight: bold;">${h.name}</div>
                <div class="badge">${h.info}</div>
                <small style="color:#94a3b8">ID: ${h.id}</small>
            </div>
            <a href="/upload-page/${encodeURIComponent(h.id)}" class="btn">رفع ترجمة</a>
        </div>
    `).join('');

    res.send(`${style}
        <div class="header"><h2>لوحة تحكم عبدالله 🎬</h2> <a href="/admin" style="color:#94a3b8; align-self:center;">الملفات المرفوعة</a></div>
        <div class="container">
            <div class="card">
                <h3 style="margin-top:0;">📺 الطلبات الأخيرة (ستريميو)</h3>
                ${items || '<div style="padding:40px; text-align:center; color:#64748b;">شغل أي فيلم في ستريميو وسيظهر هنا فوراً...</div>'}
            </div>
            <div class="card">
                <h4>🛠 إعداد الإضافة</h4>
                <p style="font-size:0.9rem;">انسخ الرابط التالي وأضفه في ستريميو:</p>
                <input value="https://${req.get('host')}/manifest.json" readonly onclick="this.select()">
                <a href="stremio://${req.get('host')}/manifest.json" class="btn" style="width:100%; text-align:center; box-sizing:border-box;">تثبيت مباشر</a>
                <p style="font-size:0.7rem; color:#94a3b8; margin-top:15px;">* يتم تحديث الصفحة تلقائياً كل 10 ثوانٍ لجلب الطلبات الجديدة.</p>
            </div>
        </div>
        <script>setTimeout(() => { if(window.location.pathname === '/') location.reload(); }, 10000);</script>
    `);
});

// صفحة الرفع
app.get('/upload-page/:id', (req, res) => {
    const item = history.find(h => h.id === req.params.id);
    res.send(`${style}
        <div class="card" style="max-width:500px; margin:60px auto;">
            <h3>رفع ملف ترجمة جديد</h3>
            <div style="background:#0f172a; padding:15px; border-radius:8px; margin-bottom:15px;">
                <strong>${item ? item.name : 'غير معروف'}</strong><br>
                <span class="badge">${item ? item.info : req.params.id}</span>
            </div>
            <form action="/upload" method="POST" enctype="multipart/form-data">
                <input type="hidden" name="imdbId" value="${req.params.id}">
                <label>اختر ملف SRT:</label><br>
                <input type="file" name="subFile" accept=".srt" required>
                <label>اسم المترجم:</label>
                <input type="text" name="label" placeholder="مثلاً: ترجمة عبدالله - جودة BluRay">
                <button type="submit" class="btn" style="width:100%; margin-top:10px;">تأكيد وحفظ</button>
            </form>
            <a href="/" style="display:block; text-align:center; margin-top:15px; color:#94a3b8; text-decoration:none;">إلغاء والعودة</a>
        </div>
    `);
});

// استقبال الرفع
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

// إدارة الملفات
app.get('/admin', (req, res) => {
    let list = db.map((s, i) => `
        <div class="item-card">
            <div style="flex-grow:1">ID: ${s.id} <br> <small>${s.label}</small></div>
            <a href="/delete/${i}" style="color:#ef4444; font-weight:bold;">حذف</a>
        </div>
    `).join('');
    res.send(`${style}<div class="card" style="margin:40px auto; max-width:800px;">
        <h3>📂 الملفات المرفوعة حالياً</h3>
        ${list || 'لا توجد ملفات.'}<br><a href="/" class="btn">العودة للرئيسية</a>
    </div>`);
});

app.get('/delete/:index', (req, res) => {
    const sub = db[req.params.index];
    if (sub) {
        const p = path.join(SUB_DIR, sub.filename);
        if (fs.existsSync(p)) fs.unlinkSync(p);
        db.splice(req.params.index, 1);
        saveData();
    }
    res.redirect('/admin');
});

// --- ربط محرك ستريميو ---
const addonInterface = builder.getInterface();
app.get('/manifest.json', (req, res) => res.json(manifest));
app.get('/subtitles/:type/:id/:extra?.json', async (req, res) => {
    try {
        const resp = await addonInterface.get('subtitles', req.params.type, req.params.id);
        res.json(resp);
    } catch (e) { res.json({ subtitles: [] }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`السيرفر شغال على المنفذ ${PORT}`));
