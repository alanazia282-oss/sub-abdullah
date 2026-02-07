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
    id: "org.abdullah.subtitles.pro.v1",
    version: "1.0.0",
    name: "sub Abdullah",
    description: "لوحة تحكم الترجمة الاحترافية",
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

        // منع التكرار: إذا كانت الحلقة موجودة، احذف القديمة واضف الجديدة فوق
        history = [newEntry, ...history.filter(h => h.id !== args.id)].slice(0, 10);
    } catch (e) { console.log("Meta error"); }

    return Promise.resolve({ subtitles: db.filter(s => s.id === args.id) });
});

const style = `
<style>
    :root { --bg: #f4f7f6; --dark: #2c3e50; --blue: #3498db; --green: #27ae60; }
    body { background: var(--bg); color: #333; font-family: 'Segoe UI', Tahoma, sans-serif; margin: 0; direction: rtl; }
    .nav { background: var(--dark); color: white; padding: 15px 50px; display: flex; justify-content: space-between; align-items: center; }
    .container { max-width: 1100px; margin: 30px auto; padding: 0 20px; display: grid; grid-template-columns: 2.5fr 1fr; gap: 20px; }
    .card { background: white; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.05); padding: 20px; margin-bottom: 20px; }
    .item-row { display: flex; align-items: center; padding: 15px; border-bottom: 1px solid #eee; transition: 0.3s; }
    .item-row:hover { background: #f9f9f9; }
    .poster { width: 50px; height: 75px; border-radius: 4px; object-fit: cover; margin-left: 20px; }
    .info h4 { margin: 0 0 5px 0; color: var(--dark); }
    .tag { font-size: 0.75rem; background: #ebedef; padding: 3px 10px; border-radius: 4px; color: #555; margin-left: 5px; }
    .btn { background: var(--blue); color: white; text-decoration: none; padding: 8px 18px; border-radius: 5px; font-weight: bold; font-size: 0.9rem; }
    .sidebar-btn { display: block; width: 100%; padding: 12px; margin-bottom: 10px; background: white; border: 1px solid #ddd; border-radius: 6px; text-decoration: none; color: #333; text-align: center; transition: 0.2s; }
    .sidebar-btn:hover { background: var(--blue); color: white; border-color: var(--blue); }
</style>
`;

app.get('/', (req, res) => {
    let rows = history.map(h => `
        <div class="item-row">
            <img src="${h.poster}" class="poster">
            <div class="info">
                <h4>${h.name}</h4>
                <span class="tag">${h.type === 'series' ? 'مسلسل' : 'فيلم'}</span>
                <span class="tag">${h.season ? `S${h.season} E${h.episode}` : 'Full Movie'}</span>
                <div style="font-size:0.7rem; color:gray; margin-top:5px;">ID: ${h.id}</div>
            </div>
            <div style="margin-right:auto;"><a href="/upload-page/${h.id}" class="btn">رفع ترجمة</a></div>
        </div>
    `).join('');

    res.send(`${style}
        <div class="nav"><b>Abdullah Subtitle System</b> <span>لوحة التحكم</span></div>
        <div class="container">
            <div class="card">
                <h3 style="margin-top:0;">النشاط الأخير</h3>
                ${rows || '<p style="text-align:center; color:gray; padding:40px;">شغل أي حلقة في ستريميو لتظهر هنا..</p>'}
            </div>
            <div>
                <div class="card">
                    <h4 style="margin-top:0;">تثبيت الإضافة</h4>
                    <p style="font-size:0.85rem; color:#666;">اضغط للربط مع ستريميو:</p>
                    <a href="stremio://${req.get('host')}/manifest.json" class="btn" style="display:block; text-align:center; background:var(--green);">Install to Stremio</a>
                </div>
                <div class="card">
                    <h4 style="margin-top:0;">إحصائياتك</h4>
                    <a href="/admin" class="sidebar-btn">📁 ملفاتك المرفوعة (${db.length})</a>
                    <a href="/" class="sidebar-btn">🔄 تحديث القائمة</a>
                </div>
            </div>
        </div>
        <script>setTimeout(() => { location.reload(); }, 30000);</script>
    `);
});

app.get('/admin', (req, res) => {
    let list = db.map((item, i) => `
        <div class="item-row">
            <div class="info"><h4>ملف ترجمة ID: ${item.id}</h4></div>
            <a href="/delete/${i}" style="color:red; text-decoration:none; font-weight:bold;">حذف 🗑️</a>
        </div>
    `).join('');
    res.send(`${style} <div class="container"><div class="card"><h3>الملفات المرفوعة</h3>${list || 'لا يوجد ملفات حالياً'} <br><br><a href="/" class="btn">العودة للرئيسية</a></div></div>`);
});

app.get('/upload-page/:id', (req, res) => {
    const item = history.find(h => h.id === req.params.id);
    if (!item) return res.redirect('/');
    res.send(`${style} <div style="max-width:450px; margin:60px auto;" class="card">
        <img src="${item.poster}" style="width:120px; display:block; margin:0 auto 15px auto; border-radius:5px;">
        <h3 style="text-align:center; margin-bottom:5px;">${item.name}</h3>
        <p style="text-align:center; color:gray;">${item.season ? `الموسم ${item.season} - الحلقة ${item.episode}` : 'فيلم'}</p>
        <form action="/upload" method="POST" enctype="multipart/form-data">
            <input type="hidden" name="imdbId" value="${item.id}">
            <div style="background:#f8f9fa; padding:20px; border:2px dashed #ddd; border-radius:8px; text-align:center; margin:20px 0;">
                <input type="file" name="subFile" accept=".srt" required>
            </div>
            <button type="submit" class="btn" style="width:100%; border:none; cursor:pointer; padding:12px;">تأكيد الرفع ✅</button>
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
app.listen(port, () => console.log("System Online and Clean!"));
