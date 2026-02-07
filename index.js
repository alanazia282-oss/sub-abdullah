const express = require('express');
const { addonBuilder } = require('stremio-addon-sdk');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const app = express();

// إعداد مجلد حفظ الترجمات
const subDir = path.join(__dirname, 'subtitles');
if (!fs.existsSync(subDir)) fs.mkdirSync(subDir);
const upload = multer({ dest: 'subtitles/' });

app.use(express.json());
app.use('/download', express.static('subtitles'));

// قواعد البيانات المؤقتة
let db = []; 
let history = []; 

// إعداد الـ Manifest للإضافة
const manifest = {
    id: "org.stremio.sub.abdullah.final.v6",
    version: "1.6.0",
    name: "sub Abdullah Pro",
    description: "لوحة تحكم احترافية للترجمات المرتبطة بسجلك",
    resources: ["subtitles"],
    types: ["movie", "series", "anime"],
    idPrefixes: ["tt", "kitsu"],
    catalogs: []
};

const builder = new addonBuilder(manifest);

// معالج جلب الترجمات وتحديث السجل تلقائياً
builder.defineSubtitlesHandler(async (args) => {
    try {
        const parts = args.id.split(':');
        const cleanId = parts[0];
        const res = await axios.get(`https://v3-cinemeta.strem.io/meta/${args.type}/${cleanId}.json`);
        const meta = res.data.meta;

        const newEntry = {
            id: args.id,
            name: meta ? meta.name : "Unknown",
            poster: meta ? meta.poster : `https://images.metahub.space/poster/medium/${cleanId}/img`,
            type: args.type,
            season: parts[1] || null,
            episode: parts[2] || null,
            time: new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })
        };

        // تحديث القائمة: حذف المكرر وإضافة الجديد في البداية (آخر 6 أعمال)
        history = [newEntry, ...history.filter(h => h.id !== args.id)].slice(0, 6);
    } catch (e) { console.log("Meta fetch error"); }

    return Promise.resolve({ subtitles: db.filter(s => s.id === args.id) });
});

// تصميم الواجهة (CSS) المماثل للموقع المطلوب
const style = `
<style>
    :root { --bg: #f8f9fa; --dark: #1a1d20; --blue: #0d6efd; --gray: #6c757d; }
    body { background: var(--bg); color: #333; font-family: 'Segoe UI', sans-serif; margin: 0; direction: rtl; }
    .navbar { background: var(--dark); color: white; padding: 15px 50px; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 2px 5px rgba(0,0,0,0.2); }
    .container { max-width: 1100px; margin: 30px auto; padding: 0 20px; display: grid; grid-template-columns: 2.5fr 1fr; gap: 25px; }
    .section-title { border-bottom: 2px solid #dee2e6; padding-bottom: 10px; margin-bottom: 20px; font-weight: bold; color: var(--dark); display: flex; justify-content: space-between; }
    .item-row { background: white; border: 1px solid #e0e0e0; border-radius: 6px; padding: 12px; margin-bottom: 12px; display: flex; align-items: center; position: relative; transition: 0.2s; }
    .item-row:hover { border-color: var(--blue); box-shadow: 0 3px 10px rgba(0,0,0,0.05); }
    .poster { width: 45px; height: 65px; border-radius: 4px; object-fit: cover; margin-left: 15px; }
    .info { flex-grow: 1; }
    .info h4 { margin: 0 0 5px 0; font-size: 1rem; color: var(--blue); }
    .tags { display: flex; gap: 8px; font-size: 0.75rem; }
    .tag { background: #eee; padding: 2px 8px; border-radius: 4px; color: #555; border: 1px solid #ccc; }
    .tag-type { background: #fff3cd; color: #856404; border-color: #ffeeba; }
    .tag-id { background: #343a40; color: white; }
    .time { font-size: 0.75rem; color: #999; position: absolute; left: 15px; top: 12px; }
    .upload-btn { background: none; border: 1px solid var(--blue); color: var(--blue); padding: 5px 12px; border-radius: 4px; cursor: pointer; text-decoration: none; font-size: 0.85rem; font-weight: bold; }
    .upload-btn:hover { background: var(--blue); color: white; }
    .sidebar-card { background: white; border-radius: 8px; border: 1px solid #e0e0e0; padding: 20px; margin-bottom: 20px; }
    .install-link { background: var(--blue); color: white; text-decoration: none; display: block; text-align: center; padding: 10px; border-radius: 5px; font-weight: bold; margin-top: 10px; }
    .stats-row { display: flex; justify-content: space-between; font-size: 0.9rem; padding: 8px 0; border-bottom: 1px solid #eee; }
</style>
`;

// مسار الصفحة الرئيسية (Dashboard)
app.get('/', (req, res) => {
    let rows = history.map(h => `
        <div class="item-row">
            <img src="${h.poster}" class="poster">
            <div class="info">
                <h4>${h.name} ${h.season ? `- S${h.season} E${h.episode}` : ''}</h4>
                <div class="tags">
                    <span class="tag tag-type">${h.type === 'series' ? 'مسلسل' : 'فيلم'}</span>
                    <span class="tag tag-id">ID: ${h.id}</span>
                </div>
            </div>
            <div class="time">${h.time}</div>
            <a href="/upload-page/${h.id}" class="upload-btn">رفع ترجمة</a>
        </div>
    `).join('');

    res.send(`${style}
        <div class="navbar">
            <div style="font-size:1.3rem; font-weight:bold;">Community Subtitles Dashboard</div>
            <div>مرحباً، عبدالله</div>
        </div>
        <div class="container">
            <div>
                <div class="section-title">
                    <span>النشاط الأخير (Recent Activity)</span>
                    <span style="font-size:0.9rem; color:var(--gray);">${history.length} أعمال</span>
                </div>
                ${rows || '<div style="text-align:center; padding:50px; background:white; border-radius:8px; border:1px solid #ddd; color:#999;">لا يوجد نشاط. شغل شيئاً في ستريميو أولاً ليظهر هنا تلقائياً.</div>'}
            </div>
            <div>
                <div class="sidebar-card">
                    <h3 style="margin-top:0; font-size:1rem; color:#28a745;">ربط الإضافة</h3>
                    <p style="font-size:0.8rem; color:var(--gray);">انسخ هذا الرابط وضعه في بحث Stremio لتفعيل المزامنة:</p>
                    <a href="stremio://${req.get('host')}/manifest.json" class="install-link">تثبيت في Stremio</a>
                </div>
                <div class="sidebar-card">
                    <h3 style="margin-top:0; font-size:1rem; color:var(--blue);">إحصائياتك</h3>
                    <div class="stats-row"><span>المرفوعات</span> <span class="tag">${db.length}</span></div>
                    <div class="stats-row"><span>جلسات العمل</span> <span class="tag">${history.length}</span></div>
                </div>
            </div>
        </div>
        <script>setTimeout(() => { location.reload(); }, 15000);</script>
    `);
});

// صفحة الرفع الخاصة
app.get('/upload-page/:id', (req, res) => {
    const item = history.find(h => h.id === req.params.id);
    if (!item) return res.redirect('/');
    res.send(`${style}
        <div style="max-width:500px; margin: 100px auto; background:white; padding:30px; border-radius:10px; border:1px solid #ddd; text-align:center;">
            <img src="${item.poster}" style="width:100px; border-radius:5px; margin-bottom:15px;">
            <h3>رفع ترجمة لـ ${item.name}</h3>
            <p style="color:#666;">${item.season ? `الموسم ${item.season} - الحلقة ${item.episode}` : 'فيلم'}</p>
            <form action="/upload" method="POST" enctype="multipart/form-data">
                <input type="hidden" name="imdbId" value="${item.id}">
                <input type="file" name="subFile" accept=".srt" required style="display:block; margin:20px auto;">
                <button type="submit" class="install-link" style="width:100%; border:none; cursor:pointer;">تأكيد الرفع ✅</button>
            </form>
            <br><a href="/" style="color:var(--gray); text-decoration:none; font-size:0.9rem;">إلغاء</a>
        </div>
    `);
});

app.post('/upload', upload.single('subFile'), (req, res) => {
    const subUrl = `https://${req.get('host')}/download/${req.file.filename}`;
    db.push({ id: req.body.imdbId, lang: "ara", url: subUrl, label: "ترجمة عبدالله" });
    res.redirect('/');
});

// مسارات ستريميو الأساسية
app.get('/manifest.json', (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.json(manifest);
});

app.get('/subtitles/:type/:id/:extra?.json', (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    builder.getInterface().get('subtitles', req.params.type, req.params.id).then(r => res.json(r));
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log("System Online!"));
