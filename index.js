const express = require('express');
const { addonBuilder } = require('stremio-addon-sdk');
const multer = require('multer');
const fs = require('fs');
const app = express();

// إعدادات المجلد لحفظ الملفات المرفوعة
if (!fs.existsSync('subtitles/')) fs.mkdirSync('subtitles/');
const upload = multer({ dest: 'subtitles/' });

app.use(express.json());
app.use('/download', express.static('subtitles'));

let db = []; 
let lastId = "لا يوجد عمل حالي";

const manifest = {
    id: "community.sub.abdullah",
    version: "1.0.0",
    name: "sub Abdullah",
    description: "إضافة عبدالله للترجمة",
    resources: ["subtitles"],
    types: ["movie", "series", "anime"],
    idPrefixes: ["tt", "kitsu"],
    catalogs: [] // هذا التعديل المهم اللي طلبه النظام
};

const builder = new addonBuilder(manifest);

builder.defineSubtitlesHandler((args) => {
    lastId = args.id;
    return Promise.resolve({ subtitles: db.filter(s => s.id === args.id) });
});

// الصفحة الرئيسية لرفع الملفات
app.get('/', (req, res) => {
    res.send(`
        <body style="background:#111; color:white; text-align:center; font-family:sans-serif; padding-top:50px;">
            <h1>sub Abdullah 🎬</h1>
            <p>المعرف الحالي: <b style="color:cyan;">${lastId}</b></p>
            <form action="/upload" method="POST" enctype="multipart/form-data">
                <input name="imdbId" placeholder="IMDB ID" value="${lastId !== "لا يوجد عمل حالي" ? lastId : ""}" required style="padding:10px;"><br><br>
                <input type="file" name="subFile" accept=".srt" required><br><br>
                <button type="submit" style="padding:10px 20px; background:blue; color:white; border:none; border-radius:5px;">رفع الترجمة</button>
            </form>
            <p style="margin-top:20px; color:#888;">رابط الإضافة لـ Stremio هو رابط الموقع الحالي مضافاً إليه /manifest.json</p>
        </body>
    `);
});

// معالجة رفع الملف
app.post('/upload', upload.single('subFile'), (req, res) => {
    const subUrl = `https://${req.get('host')}/download/${req.file.filename}`;
    db.push({ 
        id: req.body.imdbId, 
        lang: "ara", 
        url: subUrl, 
        label: "ترجمة عبدالله" 
    });
    res.send("<h1>تم الرفع بنجاح! ارجع لستريميو وجرب تشغل الفيلم</h1><a href='/'>رفع ملف جديد</a>");
});

// توجيهات Stremio
app.get('/manifest.json', (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.json(manifest);
});

app.get('/subtitles/:type/:id/:extra?.json', (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    builder.getInterface().get('subtitles', req.params.type, req.params.id).then(r => res.json(r));
});

// تشغيل السيرفر
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`السيرفر يعمل الآن على المنفذ ${port}`));
