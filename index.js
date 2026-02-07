const express = require('express');
const { addonBuilder } = require('stremio-addon-sdk');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const app = express();

// إعدادات المجلدات والملفات
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
const subDir = path.join(__dirname, 'subtitles');
if (!fs.existsSync(subDir)) fs.mkdirSync(subDir);

const DB_FILE = path.join(DATA_DIR, 'db.json');
const HISTORY_FILE = path.join(DATA_DIR, 'history.json');

let db = fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE)) : [];
let history = fs.existsSync(HISTORY_FILE) ? JSON.parse(fs.readFileSync(HISTORY_FILE)) : [];

const saveData = () => {
    fs.writeFileSync(DB_FILE, JSON.stringify(db));
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(history));
};

const upload = multer({ dest: 'subtitles/' });
app.use(express.json());
app.use('/download', express.static('subtitles'));

const manifest = {
    id: "org.abdullah.final.fix",
    version: "3.0.0",
    name: "Abdullah Sub Addon",
    description: "نظام إدارة الترجمة الاحترافي",
    resources: ["subtitles"],
    types: ["movie", "series", "anime"],
    idPrefixes: ["tt", "kitsu"],
    catalogs: []
};

const builder = new addonBuilder(manifest);

// معالج جلب الترجمات والبيانات
builder.defineSubtitlesHandler(async (args) => {
    try {
        const idParts = args.id.split(':');
        const cleanId = idParts[0];
        
        // جلب البيانات فوراً لضمان الظهور في القائمة
        let name = "جاري جلب البيانات...";
        let poster = `https://images.metahub.space/poster/medium/${cleanId}/img`;

        try {
            if (args.id.includes('kitsu')) {
                const kRes = await axios.get(`https://kitsu.io/api/edge/anime/${cleanId.replace('kitsu:', '')}`, { timeout: 3000 });
                name = kRes.data.data.attributes.canonicalTitle;
                poster = kRes.data.data.attributes.posterImage.medium;
            } else {
                const cRes = await axios.get(`https://v3-cinemeta.strem.io/meta/${args.type}/${cleanId}.json`, { timeout: 3000 });
                name = cRes.data.meta.name;
                poster = cRes.data.meta.poster;
            }
        } catch (e) { name = `ID: ${cleanId}`; }

        const entry = {
            id: args.id,
            name: name,
            poster: poster,
            type: args.type,
            season: idParts[1] || null,
            episode: idParts[2] || null,
            time: new Date().toLocaleTimeString('ar-SA')
        };

        history = [entry, ...history.filter(h => h.id !== args.id)].slice(0, 15);
        saveData();

    } catch (err) { console.error("Error in Handler"); }

    return Promise.resolve({ subtitles: db.filter(s => s.id === args.id) });
});

// واجهة المستخدم (التصميم الجديد المشابه للصورة)
const style = `
<style>
    :root { --bg: #0f172a; --card: #1e293b; --accent: #3b82f6; --text: #f1f5f9; }
    body { background: var(--bg); color: var(--text); font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; direction: rtl; }
    .header { background: var(--card); padding: 20px; text-align: center; border-bottom: 2px solid var(--accent); }
    .container { max-width: 1000px; margin: 30px auto; padding: 0 15px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 20px; }
    .card { background: var(--card); border-radius: 15px; overflow: hidden; display: flex; align-items: center; padding: 10px; transition: 0.3s; border: 1px solid #334155; }
    .card:hover { transform: translateY(-5px); border-color: var(--accent); }
    .poster { width: 80px; height: 120px; border-radius: 10px; object-fit: cover; }
    .content { flex-grow: 1; padding: 0 15px; }
    .content h3 { margin: 0 0 8px 0; font-size: 1.1rem; color: #fff; }
    .tag { font-size: 0.75rem; background: #334155; padding: 4px 8px; border-radius: 5px; margin-right: 5px; color: #cbd5e1; }
    .btn { background: var(--accent); color: white; text-decoration: none; padding: 10px 20px; border-radius: 8px; font-size: 0.9rem; font-weight: bold; display: inline-block; margin-top: 10px; }
    .empty { text-align: center; padding: 50px; color: #64748b; }
</style>
`;

app.get('/', (req, res) => {
    let cards = history.map(h => `
        <div class="card">
            <img src="${h.poster}" class="poster" onerror="this.src='https://via.placeholder.com/80x120?text=No+Img'">
            <div class="content">
                <h3>${h.name}</h3>
                <div>
                    <span class="tag">${h.type === 'movie' ? 'فيلم' : 'مسلسل'}</span>
                    ${h.season ? `<span class="tag">S${h.season} E${h.episode}</span>` : ''}
                </div>
                <a href="/upload-page/${h.id}" class="btn">رفع ملف ترجمة</a>
            </div>
        </div>
    `).join('');

    res.send(`${style}
        <div class="header">
            <h1>Abdullah Sub Dashboard</h1>
            <p style="color:#94a3b8;">رابط الإضافة: https://${req.get('host')}/manifest.json</p>
            <a href="stremio://${req.get('host')}/manifest.json" class="btn" style="background:#22c55e;">تثبيت في ستريميو ✅</a>
        </div>
        <div class="container">
            <h2 style="margin-bottom:20px; border-right:4px solid var(--accent); padding-right:15px;">النشاط الأخير</h2>
            <div class="grid">${cards || '<div class="empty">لا يوجد بيانات حتى الآن. ابدأ بمشاهدة شيء في ستريميو!</div>'}</div>
        </div>
        <script>setTimeout(()=>location.reload(), 15000);</script>
    `);
});

// صفحة الرفع (نفس التصميم الداكن)
app.get('/upload-page/:id', (req, res) => {
    const item = history.find(h => h.id === req.params.id);
    if (!item) return res.redirect('/');
    res.send(`${style}
        <div class="container" style="max-width:500px; text-align:center; margin-top:100px;">
            <div class="card" style="display:block; padding:30px;">
                <h3>رفع ترجمة لـ: ${item.name}</h3>
                <form action="/upload" method="POST" enctype="multipart/form-data">
                    <input type="hidden" name="imdbId" value="${item.id}">
                    <input type="file" name="subFile" accept=".srt" required style="margin:20px 0; color:#fff;"><br>
                    <button type="submit" class="btn" style="width:100%;">تأكيد الرفع</button>
                </form>
                <br><a href="/" style="color:#94a3b8; text-decoration:none;">إلغاء</a>
            </div>
        </div>
    `);
});

app.post('/upload', upload.single('subFile'), (req, res) => {
    const subUrl = `https://${req.get('host')}/download/${req.file.filename}`;
    db.push({ id: req.body.imdbId, lang: "ara", url: subUrl });
    saveData();
    res.redirect('/');
});

app.get('/manifest.json', (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.json(manifest);
});

app.get('/subtitles/:type/:id/:extra?.json', (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const results = db.filter(s => s.id === req.params.id);
    res.json({ subtitles: results });
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log("Server running on " + port));
