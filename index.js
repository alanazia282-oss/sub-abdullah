const express = require('express');
const { addonBuilder } = require('stremio-addon-sdk');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const app = express();

const subDir = path.join(__dirname, 'subtitles');
if (!fs.existsSync(subDir)) fs.mkdirSync(subDir);
const upload = multer({ dest: 'subtitles/' });

app.use(express.json());
app.use('/download', express.static('subtitles'));

// مخزن البيانات
let db = []; 
let currentWork = { id: null, type: null, season: null, episode: null };

const manifest = {
    id: "org.stremio.sub.abdullah.pro",
    version: "1.2.0",
    name: "sub Abdullah Pro",
    description: "إضافة عبدالله الذكية للترجمة",
    resources: ["subtitles"],
    types: ["movie", "series", "anime"],
    idPrefixes: ["tt", "kitsu"],
    catalogs: []
};

const builder = new addonBuilder(manifest);

// محرك التقاط المعلومات من ستريميو
builder.defineSubtitlesHandler((args) => {
    // التقاط بيانات الحلقة الحالية عند فتحها في ستريميو
    const parts = args.id.split(':');
    currentWork = {
        id: args.id,
        imdb: parts[0],
        type: args.type,
        season: parts[1] || null,
        episode: parts[2] || null
    };
    return Promise.resolve({ subtitles: db.filter(s => s.id === args.id) });
});

// التصميم CSS
const style = `
<style>
    body { background: #0a0a0a; color: white; font-family: 'Segoe UI', sans-serif; margin: 0; direction: rtl; }
    nav { background: #111; padding: 15px; display: flex; justify-content: center; gap: 20px; border-bottom: 2px solid #00d4ff; }
    nav a { color: #00d4ff; text-decoration: none; font-weight: bold; }
    .container { max-width: 800px; margin: 40px auto; padding: 20px; background: #161616; border-radius: 10px; text-align: center; }
    .status-card { background: #222; padding: 15px; border-radius: 8px; margin-bottom: 20px; border-right: 5px solid #00d4ff; text-align: right; }
    input, button { width: 90%; padding: 12px; margin: 10px 0; border-radius: 5px; border: none; }
    button { background: #00d4ff; color: #000; font-weight: bold; cursor: pointer; }
    .delete-btn { background: #ff4d4d; color: white; width: auto; padding: 5px 10px; }
    table { width: 100%; margin-top: 20px; border-collapse: collapse; }
    th, td { padding: 10px; border-bottom: 1px solid #333; }
</style>
`;

const navbar = `
<nav>
    <a href="/">الرئيسية</a>
    <a href="/upload-page">رفع ترجمة</a>
    <a href="/admin">إدارة الملفات</a>
</nav>
`;

// الصفحات
app.get('/', (req, res) => {
    res.send(`${style} ${navbar} <div class="container"><h1>مرحباً بك في إضافة عبدالله الذكية 🚀</h1><p>الآن الموقع مربوط مباشرة بـ Stremio.</p></div>`);
});

app.get('/upload-page', (req, res) => {
    let workDisplay = currentWork.id ? 
        `🎬 العمل الحالي: ${currentWork.imdb} ${currentWork.season ? `| موسم: ${currentWork.season} | حلقة: ${currentWork.episode}` : ''}` 
        : "⚠️ لم يتم تشغيل أي عمل في ستريميو حالياً";

    res.send(`${style} ${navbar}
        <div class="container">
            <div class="status-card">${workDisplay}</div>
            <h2>رفع ترجمة جديدة</h2>
            <form action="/upload" method="POST" enctype="multipart/form-data">
                <input name="imdbId" placeholder="المعرف (ID)" value="${currentWork.id || ''}" required>
                <input type="file" name="subFile" accept=".srt" required>
                <button type="submit">رفع الملف للعمل الحالي</button>
            </form>
        </div>
    `);
});

app.get('/admin', (req, res) => {
    let rows = db.map((item, index) => `
        <tr>
            <td>${item.id}</td>
            <td>${item.label}</td>
            <td><a href="/delete/${index}"><button class="delete-btn">حذف</button></a></td>
        </tr>
    `).join('');

    res.send(`${style} ${navbar}
        <div class="container">
            <h2>إدارة الملفات المرفوعة</h2>
            <table>
                <tr><th>المعرف</th><th>الاسم</th><th>تحكم</th></tr>
                ${rows || '<tr><td colspan="3">لا توجد ملفات مرفوعة حالياً</td></tr>'}
            </table>
        </div>
    `);
});

// العمليات
app.post('/upload', upload.single('subFile'), (req, res) => {
    const subUrl = `https://${req.get('host')}/download/${req.file.filename}`;
    db.push({ id: req.body.imdbId, lang: "ara", url: subUrl, label: "ترجمة عبدالله" });
    res.redirect('/admin');
});

app.get('/delete/:index', (req, res) => {
    db.splice(req.params.index, 1);
    res.redirect('/admin');
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
app.listen(port, () => console.log("System Running!"));
