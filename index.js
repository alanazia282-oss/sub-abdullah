const express = require('express');
const { addonBuilder } = require('stremio-addon-sdk');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const app = express();

const subDir = path.join(__dirname, 'subtitles');
if (!fs.existsSync(subDir)) fs.mkdirSync(subDir);
const upload = multer({ dest: 'subtitles/' });

app.use(express.json());
app.use('/download', express.static('subtitles'));

let db = []; 
let history = []; 

const manifest = {
    // استخدم ID ثابت ومميز جداً عشان ستريميو ما يضيعه
    id: "org.abdullah.subtitles.system.v1",
    version: "1.0.0",
    name: "Sub Abdullah Pro",
    description: "إضافة عبدالله للترجمة الاحترافية",
    resources: ["subtitles"],
    types: ["movie", "series", "anime"],
    idPrefixes: ["tt", "kitsu"],
    catalogs: []
};

const builder = new addonBuilder(manifest);

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

        history = [newEntry, ...history.filter(h => h.id !== args.id)].slice(0, 10);
    } catch (e) { console.log("Meta error"); }

    return Promise.resolve({ subtitles: db.filter(s => s.id === args.id) });
});

const style = `
<style>
    :root { --bg: #f0f2f5; --dark: #1c1e21; --blue: #1877f2; }
    body { background: var(--bg); color: #1c1e21; font-family: 'Segoe UI', sans-serif; margin: 0; direction: rtl; }
    .navbar { background: var(--dark); color: white; padding: 15px 50px; display: flex; justify-content: space-between; align-items: center; }
    .container { max-width: 1100px; margin: 30px auto; padding: 0 20px; display: grid; grid-template-columns: 2.5fr 1fr; gap: 20px; }
    .card { background: white; border-radius: 8px; box-shadow: 0 1px 2px rgba(0,0,0,0.1); padding: 20px; margin-bottom: 20px; }
    .item-row { display: flex; align-items: center; padding: 12px; border-bottom: 1px solid #eee; position: relative; }
    .poster { width: 50px; height: 75px; border-radius: 4px; object-fit: cover; margin-left: 15px; }
    .info h4 { margin: 0; color: var(--blue); }
    .tag { font-size: 0.7rem; background: #e4e6eb; padding: 2px 8px; border-radius: 5px; margin-top: 5px; display: inline-block; }
    .btn { background: var(--blue); color: white; text-decoration: none; padding: 8px 15px; border-radius: 6px; display: inline-block; font-weight: bold; border: none; cursor: pointer; }
    .sidebar-link { display: block; padding: 10px; color: #444; text-decoration: none; border-bottom: 1px solid #eee; font-size: 0.9rem; }
    .sidebar-link:hover { background: #f2f2f2; }
</style>
`;

// الصفحة الرئيسية
app.get('/', (req, res) => {
    let rows = history.map(h => `
        <div class="item-row">
            <img src="${h.poster}" class="poster">
            <div class="info">
                <h4>${h.name}</h4>
                <div class="tag">${h.season ? `S${h.season} E${h.episode}` : 'فيلم'}</div>
                <div style="font-size:0.7rem; color:gray;">ID: ${h.id}</div>
            </div>
            <div style="margin-right:auto;"><a href="/upload-page/${h.id}" class="btn">رفع ترجمة</a></div>
        </div>
    `).join('');

    res.send(`${style}
        <div class="navbar"><b>Community Subtitles Pro</b> <span>مرحباً عبدالله</span></div>
        <div class="container">
            <div>
                <div class="card">
                    <h3>النشاط الأخير</h3>
                    ${rows || '<p style="color:gray; text-align:center;">شغل شي في ستريميو الحين وبيطلع هنا</p>'}
                </div>
            </div>
            <div>
                <div class="card">
                    <h3 style="color:green;">تثبيت الإضافة</h3>
                    <p style="font-size:0.8rem;">انسخ الرابط التالي وضعه في خانة البحث بداخل ستريميو:</p>
                    <input type="text" value="https://${req.get('host')}/manifest.json" style="width:100%; padding:5px; font-size:0.7rem;" readonly>
                    <a href="stremio://${req.get('host')}/manifest.json" class="btn" style="width:85%; margin-top:10px; text-align:center;">تثبيت مباشر</a>
                </div>
                <div class="card" style="padding:0;">
                    <div style="padding:15px; font-weight:bold; border-bottom:1px solid #eee;">إدارة الملفات</div>
                    <a href="/admin" class="sidebar-link">📂 المرفوعات (${db.length})</a>
                    <a href="/" class="sidebar-link">🕒 الجلسات الحالية (${history.length})</a>
                </div>
            </div>
        </div>
        <script>setTimeout(() => { location.reload(); }, 20000);</script>
    `);
});

// صفحة الإدارة (المرفوعات)
app.get('/admin', (req, res) => {
    let list = db.map((item, i) => `
        <div class="item-row">
            <div class="info"><h4>ملف ترجمة لـ ${item.id}</h4></div>
            <a href="/delete/${i}" style="color:red; text-decoration:none;">حذف 🗑️</a>
        </div>
    `).join('');
    res.send(`${style} <div class="container"><div class="card"><h3>الملفات المرفوعة</h3>${list || 'لا يوجد ملفات'} <br><a href="/">عودة</a></div></div>`);
});

app.get('/upload-page/:id', (req, res) => {
    const item = history.find(h => h.id === req.params.id);
    if (!item) return res.redirect('/');
    res.send(`${style} <div style="max-width:400px; margin:50px auto;" class="card">
        <img src="${item.poster}" style="width:100px; display:block; margin:auto;">
        <h3 style="text-align:center;">رفع لـ ${item.name}</h3>
        <form action="/upload" method="POST" enctype="multipart/form-data">
            <input type="hidden" name="imdbId" value="${item.id}">
            <input type="file" name="subFile" accept=".srt" required style="margin:20px 0;">
            <button type="submit" class="btn" style="width:100%;">تأكيد الرفع</button>
        </form>
    </div>`);
});

app.post('/upload', upload.single('subFile'), (req, res) => {
    const subUrl = `https://${req.get('host')}/download/${req.file.filename}`;
    db.push({ id: req.body.imdbId, lang: "ara", url: subUrl });
    res.redirect('/');
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
app.listen(port, () => console.log("System Fixed!"));
