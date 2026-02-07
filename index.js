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

let db = []; 
let currentWork = { id: null, type: null, season: null, episode: null, poster: null };

const manifest = {
    id: "org.stremio.sub.abdullah.cinema",
    version: "1.3.0",
    name: "sub Abdullah Cinema",
    description: "واجهة سينمائية لرفع الترجمات",
    resources: ["subtitles"],
    types: ["movie", "series", "anime"],
    idPrefixes: ["tt", "kitsu"],
    catalogs: []
};

const builder = new addonBuilder(manifest);

builder.defineSubtitlesHandler((args) => {
    const parts = args.id.split(':');
    // محاولة جلب البوستر (ستريميو يرسل أحياناً المعرف فقط، سنستخدم خدمة صور خارجية)
    const imdbId = parts[0];
    currentWork = {
        id: args.id,
        imdb: imdbId,
        type: args.type,
        season: parts[1] || null,
        episode: parts[2] || null,
        poster: `https://images.metahub.space/poster/medium/${imdbId}/img`
    };
    return Promise.resolve({ subtitles: db.filter(s => s.id === args.id) });
});

// التصميم الجديد (الواجهة الاحترافية)
const style = `
<style>
    body { background: #050505; color: white; font-family: 'Cairo', sans-serif; margin: 0; direction: rtl; }
    .hero { 
        height: 400px; background-size: cover; background-position: center;
        position: relative; display: flex; align-items: flex-end; justify-content: center;
    }
    .hero::after { 
        content: ''; position: absolute; width: 100%; height: 100%; 
        background: linear-gradient(to top, #050505, transparent); 
    }
    .content { position: relative; z-index: 10; text-align: center; margin-top: -50px; padding: 20px; }
    .poster { width: 180px; border-radius: 12px; border: 3px solid #00d4ff; box-shadow: 0 0 20px rgba(0,212,255,0.5); }
    .info-card { background: #111; padding: 25px; border-radius: 20px; max-width: 500px; margin: 20px auto; border: 1px solid #222; }
    h1 { color: #00d4ff; margin: 10px 0; }
    .badge { background: #00d4ff; color: #000; padding: 5px 15px; border-radius: 50px; font-weight: bold; font-size: 0.9em; }
    input[type="file"] { display: none; }
    .custom-upload { 
        background: #00d4ff; color: #000; padding: 15px 30px; border-radius: 10px; 
        font-weight: bold; cursor: pointer; display: inline-block; transition: 0.3s;
    }
    .custom-upload:hover { transform: scale(1.05); background: #fff; }
    button { background: #2ecc71; color: white; border: none; padding: 12px 40px; border-radius: 10px; font-size: 1.1em; cursor: pointer; margin-top: 15px; }
    nav { background: rgba(0,0,0,0.8); padding: 15px; position: fixed; width: 100%; z-index: 100; text-align: center; }
    nav a { color: #fff; text-decoration: none; margin: 0 15px; font-weight: bold; opacity: 0.7; }
    nav a:hover { opacity: 1; color: #00d4ff; }
</style>
`;

app.get('/', (req, res) => {
    if (!currentWork.id) {
        return res.send(`${style} <div style="text-align:center; padding-top:100px;">
            <h1>أهلاً عبدالله.. اذهب لستريميو وشغل حلقة 🎬</h1>
            <p>الموقع سينتظر إشارة منك هناك ليبدأ العمل!</p>
        </div>`);
    }

    res.send(`${style}
        <nav><a href="/">الرئيسية</a><a href="/admin">الملفات المرفوعة</a></nav>
        <div class="hero" style="background-image: url('${currentWork.poster}')"></div>
        <div class="content">
            <img src="${currentWork.poster}" class="poster">
            <div class="info-card">
                <span class="badge">${currentWork.type === 'series' ? 'مسلسل' : 'فيلم'}</span>
                <h1>جاري المشاهدة الآن...</h1>
                <p style="font-size: 1.2em;">ID: ${currentWork.imdb}</p>
                ${currentWork.season ? `<p>الموسم: <b>${currentWork.season}</b> | الحلقة: <b>${currentWork.episode}</b></p>` : ''}
                
                <hr style="border: 0.5px solid #333; margin: 20px 0;">
                
                <form action="/upload" method="POST" enctype="multipart/form-data">
                    <input type="hidden" name="imdbId" value="${currentWork.id}">
                    <label class="custom-upload">
                        اختر ملف الترجمة .srt 📁
                        <input type="file" name="subFile" accept=".srt" required onchange="this.form.submitBtn.style.display='block'">
                    </label>
                    <br>
                    <button type="submit" name="submitBtn" style="display:none;">تأكيد ورفع الآن ✅</button>
                </form>
            </div>
        </div>
    `);
});

// صفحة الإدارة لمسح الملفات
app.get('/admin', (req, res) => {
    let rows = db.map((item, index) => `
        <div style="background:#111; margin:10px; padding:15px; border-radius:10px; display:flex; justify-content:space-between; align-items:center;">
            <span>${item.id} - ${item.label}</span>
            <a href="/delete/${index}" style="color:#ff4d4d; text-decoration:none;">حذف 🗑️</a>
        </div>
    `).join('');
    res.send(`${style} <div style="padding:20px;"><h1>الملفات المرفوعة</h1>${rows || 'لا يوجد ملفات'}<br><a href="/" style="color:#00d4ff;">العودة للرئيسية</a></div>`);
});

app.post('/upload', upload.single('subFile'), (req, res) => {
    const subUrl = `https://${req.get('host')}/download/${req.file.filename}`;
    db.push({ id: req.body.imdbId, lang: "ara", url: subUrl, label: "ترجمة عبدالله" });
    res.send(`${style} <div style="text-align:center; padding-top:100px;"><h1>✅ تم الرفع!</h1><p>ارجع لستريميو، الترجمة موجودة الآن.</p><a href="/" style="color:#00d4ff;">العودة</a></div>`);
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
app.listen(port, () => console.log("Cinema UI Ready!"));
