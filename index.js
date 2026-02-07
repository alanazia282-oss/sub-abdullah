const express = require('express');
const { addonBuilder } = require('stremio-addon-sdk');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const app = express();

// 1. إعداد المجلدات والبيانات
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

// 2. إعداد المانيفست (مع إصلاح خطأ Catalogs)
const manifest = {
    id: "org.abdullah.community.subs",
    version: "1.0.0",
    name: "Community Subtitles",
    description: "لوحة تحكم ترجمات عبد الله",
    resources: ["subtitles"],
    types: ["movie", "series", "anime"],
    idPrefixes: ["tt", "kitsu"],
    catalogs: [] 
};

const builder = new addonBuilder(manifest);

// 3. معالج الترجمات وجلب البيانات (IMDb + Kitsu)
builder.defineSubtitlesHandler(async (args) => {
    const parts = args.id.split(':');
    const cleanId = parts[0];
    const isSeries = parts.length > 1;
    
    let name = "جاري الجلب...";
    let poster = "";
    let episodeName = "";

    try {
        // محاولة جلب من Cinemeta (IMDb)
        const res = await axios.get(`https://v3-cinemeta.strem.io/meta/${args.type === 'anime' ? 'series' : args.type}/${cleanId}.json`, { timeout: 2500 }).catch(() => null);
        
        if (res && res.data && res.data.meta) {
            const meta = res.data.meta;
            name = meta.name;
            poster = meta.poster;
            if (isSeries && meta.videos) {
                const v = meta.videos.find(x => x.season == parts[1] && x.episode == parts[2]);
                episodeName = v ? ` - ${v.title}` : ` (S${parts[1]} E${parts[2]})`;
            }
        }

        // محاولة جلب من Kitsu (للأنمي أو كاحتياط)
        if (!poster || args.type === 'anime' || cleanId.startsWith('kitsu')) {
            const kId = cleanId.replace('kitsu:', '');
            const kRes = await axios.get(`https://kitsu.io/api/edge/anime/${kId}`, { timeout: 2500 }).catch(() => null);
            if (kRes && kRes.data && kRes.data.data) {
                const attr = kRes.data.data.attributes;
                if (name === "جاري الجلب...") name = attr.canonicalTitle;
                if (!poster) poster = attr.posterImage.medium;
                if (isSeries && !episodeName) episodeName = ` - الحلقة ${parts[2]}`;
            }
        }

        if (!poster) poster = `https://images.metahub.space/poster/medium/${cleanId}/img`;

        const entry = {
            id: args.id,
            name: name + episodeName,
            poster: poster,
            type: args.type,
            time: new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })
        };

        history = [entry, ...history.filter(h => h.id !== args.id)].slice(0, 10);
        saveData();
    } catch (e) { console.log("Fetch Error"); }

    return { subtitles: db.filter(s => s.id === args.id) };
});

// 4. التصميم (مطابق للصورة تماماً)
const uiStyle = `
<style>
    body { background: #f0f2f5; font-family: 'Segoe UI', Tahoma; margin: 0; direction: rtl; }
    .nav { background: #1e293b; color: white; padding: 12px 50px; display: flex; justify-content: space-between; align-items: center; }
    .container { max-width: 1100px; margin: 30px auto; display: grid; grid-template-columns: 1fr 320px; gap: 25px; padding: 0 20px; }
    .card { background: white; border-radius: 8px; border: 1px solid #ddd; overflow: hidden; margin-bottom: 20px; }
    .card-h { background: #f8fafc; padding: 12px 15px; border-bottom: 1px solid #ddd; font-weight: bold; font-size: 14px; display: flex; justify-content: space-between; }
    .item { display: flex; padding: 15px; border-bottom: 1px solid #eee; align-items: center; }
    .item img { width: 50px; height: 75px; border-radius: 4px; object-fit: cover; margin-left: 15px; }
    .tag { font-size: 10px; background: #fbbf24; color: black; padding: 2px 6px; border-radius: 4px; margin-left: 8px; }
    .btn-blue { background: #2563eb; color: white; text-decoration: none; padding: 12px; border-radius: 6px; display: block; text-align: center; font-weight: bold; }
    .badge { background: #2563eb; color: white; padding: 2px 10px; border-radius: 20px; font-size: 11px; }
    .stat-row { padding: 12px; display: flex; justify-content: space-between; border-bottom: 1px solid #eee; font-size: 13px; }
</style>
`;

app.get('/', (req, res) => {
    let rows = history.map(h => `
        <div class="item">
            <img src="${h.poster}">
            <div style="flex-grow:1">
                <div style="font-weight:bold; color:#1e293b; margin-bottom:5px;">${h.name}</div>
                <span class="tag">${h.type === 'movie' ? 'فيلم' : 'مسلسل'}</span>
                <small style="color:#64748b">ID: ${h.id}</small>
            </div>
            <div style="text-align:left">
                <small style="color:#94a3b8; display:block; margin-bottom:8px;">${h.time}</small>
                <a href="/upload-page/${h.id}" style="text-decoration:none; font-size:20px;">📁</a>
            </div>
        </div>
    `).join('');

    res.send(`${uiStyle}
        <div class="nav">
            <div><b>CC Community Subtitles</b> &nbsp; Dashboard</div>
            <div style="font-size:12px">لوحة تحكم المطور</div>
        </div>
        <div class="container">
            <div>
                <h1 style="margin:0 0 10px 0;">Your Dashboard</h1>
                <p style="color:#64748b; margin-bottom:20px;">أهلاً بك! هنا تظهر قائمة الحلقات التي تشاهدها لرفع ترجمتها.</p>
                <div class="card">
                    <div class="card-h">النشاط الأخير <span class="badge">${history.length}</span></div>
                    ${rows || '<div style="padding:50px; text-align:center; color:#94a3b8;">لا يوجد نشاط. شغل شيئاً في ستريميو وافتح قائمة الترجمة!</div>'}
                </div>
            </div>
            <div>
                <div class="card" style="border-top: 4px solid #16a34a;">
                    <div class="card-h">تثبيت الربط</div>
                    <div style="padding:15px;">
                        <p style="font-size:12px; color:#64748b;">انسخ الرابط وضعه في ستريميو أو اضغط الزر:</p>
                        <a href="stremio://${req.get('host')}/manifest.json" class="btn-blue">Install Addon</a>
                    </div>
                </div>
                <div class="card" style="border-top: 4px solid #2563eb;">
                    <div class="card-h" style="background:#2563eb; color:white;">إحصائياتك</div>
                    <div class="stat-row">الترجمات المرفوعة <span class="badge">${db.length}</span></div>
                    <div class="stat-row">الطلبات المسجلة <span class="badge">${history.length}</span></div>
                </div>
            </div>
        </div>
        <script>setTimeout(() => { location.reload(); }, 20000);</script>
    `);
});

// 5. مسارات الرفع والمانيفست
app.get('/upload-page/:id', (req, res) => {
    const item = history.find(h => h.id === req.params.id);
    if (!item) return res.redirect('/');
    res.send(`${uiStyle}<div style="max-width:400px; margin:100px auto;" class="card">
        <div class="card-h">رفع ترجمة لـ: ${item.name}</div>
        <form action="/upload" method="POST" enctype="multipart/form-data" style="padding:20px; text-align:center;">
            <input type="hidden" name="imdbId" value="${item.id}">
            <input type="file" name="subFile" accept=".srt" required style="margin-bottom:20px;"><br>
            <button type="submit" class="btn-blue" style="width:100%; border:none; cursor:pointer;">رفع الآن ✅</button>
        </form>
    </div>`);
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
    res.json({ subtitles: db.filter(s => s.id === req.params.id) });
});

app.listen(process.env.PORT || 3000, () => console.log("Addon Live!"));
