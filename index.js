const express = require('express');
const { addonBuilder } = require('stremio-addon-sdk');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const app = express();

// إعداد مجلد حفظ الملفات
const upload = multer({ dest: 'subtitles/' });
app.use(express.json());
app.use('/download', express.static('subtitles'));

let db = []; 
let lastViewedId = "لا يوجد عمل حالي";

// 1. تعريف الإضافة باسم sub Abdullah
const manifest = {
    id: "community.sub.abdullah.final",
    version: "1.5.0",
    name: "sub Abdullah",
    description: "إضافة لرفع الترجمات العربية للأفلام والأنمي - بواسطة عبدالله",
    resources: ["subtitles"],
    types: ["movie", "series", "anime"],
    idPrefixes: ["tt", "kitsu"]
};

const builder = new addonBuilder(manifest);

builder.defineSubtitlesHandler((args) => {
    lastViewedId = args.id;
    console.log("Stremio طلب ترجمة لـ:", lastViewedId);
    const subs = db.filter(s => s.id === args.id);
    return Promise.resolve({ subtitles: subs });
});

// 2. واجهة التحكم (الموقع)
app.get('/', (req, res) => {
    res.send(`
        <body style="font-family:sans-serif; background:#0a0a0a; color:white; text-align:center; padding:30px;">
            <div style="max-width:450px; margin:auto; background:#161616; padding:25px; border-radius:15px; border:1px solid #333; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
                <h2 style="color:#42a5f5; margin-bottom:5px;">sub Abdullah 🎬</h2>
                <p style="color:#777; font-size:14px; margin-top:0;">لوحة رفع الترجمات العربية</p>
                
                <div style="background:#000; padding:12px; border-radius:10px; margin:20px 0; border: 1px solid #222;">
                    <small style="color:#888;">العمل المفتوح حالياً في ستريميو:</small><br>
                    <code style="font-size:18px; color:#4caf50;">${lastViewedId}</code>
                </div>

                <form action="/upload" method="POST" enctype="multipart/form-data" style="text-align:right;">
                    <label style="font-size:14px; color:#aaa;">رقم العمل (ID):</label>
                    <input name="imdbId" value="${lastViewedId !== "لا يوجد عمل حالي" ? lastViewedId : ""}" required 
                           style="width:100%; padding:12px; margin:8px 0 18px; border-radius:8px; border:none; background:#2c2c2c; color:white; box-sizing:border-box;">
                    
                    <label style="font-size:14px; color:#aaa;">ملف الترجمة (SRT):</label>
                    <input type="file" name="subFile" accept=".srt" required style="margin:10px 0 20px; display:block; color:#aaa;">
                    
                    <label style="font-size:14px; color:#aaa;">اسم المترجم (سيظهر في القائمة):</label>
                    <input name="label" placeholder="مثلاً: ترجمة عبدالله" 
                           style="width:100%; padding:12px; margin:8px 0 25px; border-radius:8px; border:none; background:#2c2c2c; color:white; box-sizing:border-box;">
                    
                    <button type="submit" style="width:100%; padding:15px; background:#42a5f5; color:white; border:none; border-radius:8px; font-weight:bold; cursor:pointer; font-size:16px;">تفعيل الترجمة في ستريميو</button>
                </form>

                <hr style="margin:25px 0; border:0; border-top:1px solid #333;">
                <p style="font-size:12px; color:#666; margin-bottom:10px;">انسخ رابط الصفحة وضعه في بحث إضافات Stremio</p>
                <button onclick="window.location.href='stremio://${req.get('host')}/manifest.json'" 
                        style="background:transparent; color:#42a5f5; border:1px solid #42a5f5; padding:10px 15px; border-radius:8px; cursor:pointer; font-weight:bold; font-size:13px;">
                    تثبيت الإضافة تلقائياً ➕
                </button>
            </div>
        </body>
    `);
});

// 3. استقبال الملف وحفظه
app.post('/upload', upload.single('subFile'), (req, res) => {
    if (!req.file) return res.status(400).send("خطأ: لم يتم اختيار ملف.");
    
    const subUrl = `https://${req.get('host')}/download/${req.file.filename}`;
    
    db.push({
        id: req.body.imdbId,
        lang: "ara", // تظهر دائماً في قسم Arabic
        url: subUrl,
        label: req.body.label || "sub Abdullah"
    });

    res.send(`
        <div style="text-align:center; padding:80px; background:#0a0a0a; color:white; font-family:sans-serif;">
            <h1 style="color:#4caf50;">✅ تم الرفع بنجاح!</h1>
            <p style="font-size:18px;">ارجع الآن لـ Stremio وشغل الفيلم، ستجد الترجمة في قائمة "Arabic".</p>
            <br><br>
            <a href="/" style="color:#42a5f5; text-decoration:none; border:1px solid #42a5f5; padding:12px 25px; border-radius:8px; font-weight:bold;">رفع ملف آخر</a>
        </div>
    `);
});

// 4. مسارات Stremio (لا تغير فيها شيء)
app.get('/manifest.json', (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.json(manifest);
});

app.get('/subtitles/:type/:id/:extra?.json', (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    builder.getInterface().get('subtitles', req.params.type, req.params.id)
        .then(result => res.json(result))
        .catch(() => res.json({ subtitles: [] }));
});

// تشغيل السيرفر
const port = process.env.PORT || 3000;
app.listen(port, () => {
    if (!fs.existsSync('subtitles/')) fs.mkdirSync('subtitles/');
    console.log(`إضافة sub Abdullah تعمل الآن على المنفذ ${port}`);
});
