const express = require('express');
const { addonBuilder } = require('stremio-addon-sdk');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// إعداد المجلدات
const DATA_DIR = path.join(__dirname, 'data');
const SUB_DIR = path.join(__dirname, 'subtitles');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(SUB_DIR)) fs.mkdirSync(SUB_DIR, { recursive: true });

const DB_FILE = path.join(DATA_DIR, 'db.json');
const HISTORY_FILE = path.join(DATA_DIR, 'history.json');

let db = JSON.parse(fs.existsSync(DB_FILE) ? fs.readFileSync(DB_FILE, 'utf8') : '[]');
let history = JSON.parse(fs.existsSync(HISTORY_FILE) ? fs.readFileSync(HISTORY_FILE, 'utf8') : '[]');

const saveData = () => {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
};

const upload = multer({ dest: 'subtitles/' });
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/download', express.static('subtitles'));

const manifest = {
    id: "org.community.subtitle.manager",
    version: "1.0.0",
    name: "Community Subtitles",
    description: "تظهر الحلقة هنا فور مشاهدتها في ستريميو",
    resources: ["subtitles"],
    types: ["movie", "series", "anime"],
    idPrefixes: ["tt", "kitsu"]
};

const builder = new addonBuilder(manifest);

// --- المحرك الأساسي: هنا "صيد" الحلقة ---
builder.defineSubtitlesHandler(async (args) => {
    const { type, id } = args; // الـ ID يكون مثل tt12345:1:1
    
    // 1. تشيك إذا الحلقة موجودة أصلاً عشان ما نكررها
    let item = history.find(h => h.id === id);
    
    if (!item) {
        // 2. إذا مو موجودة، ضيفها فوراً ببيانات مؤقتة
        item = {
            id: id,
            type: type,
            name: "جاري جلب الاسم...",
            poster: "",
            time: new Date().toLocaleTimeString('ar-SA')
        };
        history.unshift(item); 
        if (history.length > 20) history.pop();
        saveData();

        // 3. جلب البيانات الحقيقية (الاسم والبوستر) في الخلفية
        updateEntryMeta(id, type);
    }

    // 4. ابحث عن ترجمات مرفوعة مسبقاً لهذه الحلقة
    const subs = db.filter(s => s.id === id).map(s => ({
        id: s.url,
        url: s.url,
        lang: "ara",
        label: s.label
    }));

    return Promise.resolve({ subtitles: subs });
});

async function updateEntryMeta(id, type) {
    const cleanId = id.split(':')[0];
    try {
        let name = id;
        let poster = "";

        if (cleanId.startsWith('tt')) {
            const res = await axios.get(`https://v3-cinemeta.strem.io/meta/${type}/${cleanId}.json`);
            const meta = res.data.meta;
            name = meta.name;
            poster = meta.poster;
            if (type === 'series') {
                const parts = id.split(':');
                name += ` - S${parts[1]} E${parts[2]}`;
            }
        }
        
        // تحديث السجل بالبيانات الجديدة
        history = history.map(h => h.id === id ? { ...h, name, poster } : h);
        saveData();
    } catch (e) { console.error("Meta error"); }
}

// --- مسارات لوحة التحكم ---
app.get('/', (req, res) => {
    let list = history.map(h => `
        <div style="border:1px solid #ddd; padding:10px; margin:10px; display:flex; align-items:center; border-radius:8px;">
            <img src="${h.poster}" style="width:50px; height:75px; margin-right:15px; border-radius:4px;">
            <div style="flex-grow:1">
                <h3 style="margin:0">${h.name}</h3>
                <small>${h.id}</small>
            </div>
            <a href="/upload/${encodeURIComponent(h.id)}" style="background:#28a745; color:white; padding:8px 15px; text-decoration:none; border-radius:5px;">رفع ترجمة</a>
        </div>
    `).join('');

    res.send(`
        <html><body style="font-family:sans-serif; background:#f4f4f4; padding:20px;">
            <h2>لوحة تحكم الترجمات المجتمعية</h2>
            <div style="background:white; padding:20px; border-radius:10px; box-shadow:0 2px 5px rgba(0,0,0,0.1);">
                ${list || '<p>شغل أي فيلم في ستريميو وسيظهر هنا فوراً</p>'}
            </div>
            <p style="text-align:center; color:#666;">رابط الإضافة: <code>https://${req.get('host')}/manifest.json</code></p>
        </body></html>
    `);
});

app.get('/upload/:id', (req, res) => {
    res.send(`
        <form action="/do-upload" method="POST" enctype="multipart/form-data" style="max-width:400px; margin:50px auto; font-family:sans-serif;">
            <h3>رفع ترجمة لـ: ${req.params.id}</h3>
            <input type="hidden" name="id" value="${req.params.id}">
            <input type="file" name="sub" required><br><br>
            <input type="text" name="label" placeholder="اسم المترجم أو اللغة" required style="width:100%; padding:8px;"><br><br>
            <button type="submit" style="width:100%; padding:10px; background:#007bff; color:white; border:none; cursor:pointer;">حفظ ونشر</button>
        </form>
    `);
});

app.post('/do-upload', upload.single('sub'), (req, res) => {
    db.push({
        id: req.body.id,
        url: `https://${req.get('host')}/download/${req.file.filename}`,
        label: req.body.label
    });
    saveData();
    res.send('تم الرفع! ارجع لستريميو وسكر الحلقة وشغلها مرة ثانية بتلقى الترجمة.');
});

app.get('/manifest.json', (req, res) => res.json(manifest));
app.get('/subtitles/:type/:id/:extra?.json', (req, res) => {
    builder.getInterface().get('subtitles', req.params.type, req.params.id)
        .then(r => res.json(r)).catch(() => res.json({ subtitles: [] }));
});

app.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));
