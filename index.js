/**
 * نظام عبدالله الاحترافي المتكامل لإدارة ترجمات Stremio
 * الإصدار: 2.0.0
 * المميزات: عرض البوسترات، دعم المواسم والحلقات، سجل الطلبات، إدارة الملفات
 */

const express = require('express');
const { addonBuilder } = require('stremio-addon-sdk');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cors = require('cors');

const app = express();

// --- إعدادات المجلدات والبيانات ---
const DATA_DIR = path.join(__dirname, 'data');
const SUB_DIR = path.join(__dirname, 'subtitles');

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(SUB_DIR)) {
    fs.mkdirSync(SUB_DIR, { recursive: true });
}

const DB_FILE = path.join(DATA_DIR, 'db.json');
const HISTORY_FILE = path.join(DATA_DIR, 'history.json');

// تحميل البيانات أو إنشاء مصفوفات فارغة
let db = fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE)) : [];
let history = fs.existsSync(HISTORY_FILE) ? JSON.parse(fs.readFileSync(HISTORY_FILE)) : [];

/**
 * وظيفة حفظ البيانات لضمان عدم ضياع الترجمات أو السجل
 */
const saveData = () => {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 4));
        fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 4));
    } catch (err) {
        console.error("[خطأ في الحفظ]:", err);
    }
};

// إعداد رفع الملفات (Multer)
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'subtitles/'),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'sub-' + uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/download', express.static('subtitles'));

// --- Stremio Manifest Configuration ---
const manifest = {
    id: "org.abdullah.pro.system.v2",
    version: "2.0.0",
    name: "Abdullah Ultimate Subtitles",
    description: "نظام متطور لعرض الترجمات مع دعم الحلقات والبوسترات",
    resources: ["subtitles"],
    types: ["movie", "series", "anime"],
    idPrefixes: ["tt", "kitsu"],
    catalogs: [] // مصفوفة فارغة لتجنب خطأ الـ SDK
};

const builder = new addonBuilder(manifest);

/**
 * معالج طلبات الترجمة (Subtitles Handler)
 * يقوم بتحليل الـ ID وجلب معلومات الميتا والبوسترات
 */
builder.defineSubtitlesHandler(async (args) => {
    const fullId = args.id; // مثال: tt12345:1:5
    const parts = fullId.split(':');
    const cleanId = parts[0];

    // التحقق من وجود العمل في السجل لتجنب تكرار جلب البيانات
    let currentEntry = history.find(h => h.id === fullId);

    if (!currentEntry) {
        let metaTitle = "جاري جلب الاسم...";
        let metaPoster = `https://images.metahub.space/poster/medium/${cleanId}/img`;
        let seasonDetail = "";

        // تحديد الموسم والحلقة من المعرف
        if (args.type === 'series' && parts.length >= 3) {
            seasonDetail = `الموسم ${parts[1]} - الحلقة ${parts[2]}`;
        } else if (args.type === 'anime' && parts.length >= 2) {
            seasonDetail = `الحلقة ${parts[1]}`;
        } else {
            seasonDetail = "فيلم";
        }

        try {
            // جلب البيانات من Cinemeta لضمان دقة العنوان والبوستر
            const metaRes = await axios.get(`https://v3-cinemeta.strem.io/meta/${args.type}/${cleanId}.json`, { timeout: 4000 });
            if (metaRes.data && metaRes.data.meta) {
                const m = metaRes.data.meta;
                metaTitle = m.name || metaTitle;
                
                // جلب بوستر الحلقة المحددة إذا كان مسلسلاً
                if (args.type === 'series' && parts[1]) {
                    const epInfo = m.videos?.find(v => v.season == parts[1] && v.number == parts[2]);
                    if (epInfo && epInfo.thumbnail) {
                        metaPoster = epInfo.thumbnail;
                    } else {
                        metaPoster = m.poster || metaPoster;
                    }
                } else {
                    metaPoster = m.poster || metaPoster;
                }
            }
        } catch (err) {
            console.log("[خطأ ميتا]: لم يتم العثور على بيانات إضافية لـ " + cleanId);
        }

        currentEntry = {
            id: fullId,
            name: metaTitle,
            poster: metaPoster,
            info: seasonDetail,
            type: args.type,
            addedAt: new Date().toLocaleString('ar-SA')
        };

        // تحديث السجل (آخر 25 طلب)
        history = [currentEntry, ...history.filter(h => h.id !== fullId)].slice(0, 25);
        saveData();
    }

    // البحث عن الترجمات المرفوعة لهذا المعرف
    const results = db.filter(s => s.id === fullId).map(s => ({
        id: s.url,
        url: s.url,
        lang: "ara",
        label: s.label || "ترجمة عبدالله الاحترافية"
    }));

    return { subtitles: results };
});

// --- واجهة المستخدم الرسومية (HTML/CSS) ---
const getLayout = (content) => `
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>لوحة تحكم عبدالله</title>
    <style>
        :root { --primary: #e11d48; --bg: #0f172a; --card: #1e293b; --text: #f1f5f9; }
        body { background-color: var(--bg); color: var(--text); font-family: 'Segoe UI', Tahoma, sans-serif; margin: 0; padding: 0; }
        .navbar { background: var(--card); padding: 15px 5%; border-bottom: 3px solid var(--primary); display: flex; justify-content: space-between; align-items: center; box-shadow: 0 4px 10px rgba(0,0,0,0.3); }
        .container { max-width: 1200px; margin: 30px auto; padding: 0 20px; display: grid; grid-template-columns: 2fr 1fr; gap: 30px; }
        .main-card { background: var(--card); border-radius: 15px; padding: 25px; }
        .side-card { background: var(--card); border-radius: 15px; padding: 20px; height: fit-content; }
        .item-list { display: flex; flex-direction: column; gap: 15px; }
        .item-card { display: flex; align-items: center; background: #334155; padding: 15px; border-radius: 12px; transition: 0.2s; border-right: 5px solid transparent; }
        .item-card:hover { border-right-color: var(--primary); transform: translateX(-5px); }
        .poster-img { width: 80px; height: 110px; border-radius: 8px; object-fit: cover; margin-left: 20px; background: #000; box-shadow: 0 4px 8px rgba(0,0,0,0.5); }
        .details { flex-grow: 1; }
        .details h4 { margin: 0 0 5px 0; font-size: 1.1rem; color: #fff; }
        .badge { background: var(--primary); color: white; padding: 3px 10px; border-radius: 4px; font-size: 0.8rem; font-weight: bold; }
        .season-info { color: #fbbf24; font-size: 0.9rem; font-weight: bold; margin-top: 5px; display: block; }
        .btn { background: var(--primary); color: white; padding: 10px 20px; border-radius: 8px; text-decoration: none; font-weight: bold; display: inline-block; border: none; cursor: pointer; transition: 0.3s; }
        .btn:hover { opacity: 0.8; }
        .input-group { margin-bottom: 15px; }
        input[type="text"] { width: 100%; padding: 12px; border-radius: 8px; border: 1px solid #475569; background: #0f172a; color: white; box-sizing: border-box; }
        .footer-text { font-size: 0.8rem; color: #94a3b8; margin-top: 20px; text-align: center; }
        @media (max-width: 768px) { .container { grid-template-columns: 1fr; } }
    </style>
</head>
<body>
    <div class="navbar">
        <h2>لوحة تحكم عبدالله 🚀</h2>
        <div>
            <a href="/" style="color: white; text-decoration: none; margin-left: 20px;">الرئيسية</a>
            <a href="/manage" style="color: #94a3b8; text-decoration: none;">إدارة الملفات</a>
        </div>
    </div>
    ${content}
</body>
</html>
`;

// المسار الرئيسي لعرض السجل
app.get('/', (req, res) => {
    let itemsHtml = history.map(h => `
        <div class="item-card">
            <img src="${h.poster}" class="poster-img" onerror="this.src='https://via.placeholder.com/80x110?text=No+Image'">
            <div class="details">
                <h4>${h.name}</h4>
                <span class="season-info">${h.info}</span>
                <code style="font-size: 0.7rem; color: #94a3b8;">ID: ${h.id}</code>
            </div>
            <a href="/upload-page/${encodeURIComponent(h.id)}" class="btn">رفع ترجمة</a>
        </div>
    `).join('');

    const mainContent = `
        <div class="container">
            <div class="main-card">
                <h3 style="margin-top:0;">📺 الطلبات الأخيرة من ستريميو</h3>
                <div class="item-list">
                    ${itemsHtml || '<p style="text-align:center; color:#64748b; padding: 40px;">لا توجد طلبات حالياً. قم بتشغيل فيلم أو حلقة في ستريميو لتظهر هنا.</p>'}
                </div>
            </div>
            <div class="side-card">
                <h3>🛠 الإعدادات</h3>
                <div class="input-group">
                    <label>رابط الإضافة (انسخه لستريميو):</label>
                    <input type="text" readonly value="https://${req.get('host')}/manifest.json">
                </div>
                <a href="stremio://${req.get('host')}/manifest.json" class="btn" style="width:100%; text-align:center; box-sizing: border-box;">تثبيت تلقائي</a>
                <p class="footer-text">سيتم تحديث هذه القائمة تلقائياً عند طلب ترجمة جديدة.</p>
            </div>
        </div>
        <script>setTimeout(() => { if(window.location.pathname === '/') location.reload(); }, 15000);</script>
    `;
    res.send(getLayout(mainContent));
});

// صفحة رفع الملفات
app.get('/upload-page/:id', (req, res) => {
    const item = history.find(h => h.id === req.params.id);
    const content = `
        <div class="main-card" style="max-width: 600px; margin: 50px auto;">
            <h3>رفع ملف ترجمة (SRT)</h3>
            <div style="background: #334155; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
                <strong>العمل:</strong> ${item ? item.name : 'غير معروف'}<br>
                <strong>المعلومات:</strong> ${item ? item.info : req.params.id}
            </div>
            <form action="/upload" method="POST" enctype="multipart/form-data">
                <input type="hidden" name="imdbId" value="${req.params.id}">
                <div class="input-group">
                    <label>اختر الملف من جهازك:</label><br><br>
                    <input type="file" name="subFile" accept=".srt" required style="color: white;">
                </div>
                <div class="input-group">
                    <label>اسم المترجم (يظهر في ستريميو):</label>
                    <input type="text" name="label" placeholder="مثال: ترجمة عبدالله">
                </div>
                <button type="submit" class="btn" style="width: 100%;">بدء الرفع والاعتماد ✅</button>
            </form>
            <br>
            <a href="/" style="color: #94a3b8; text-decoration: none; display: block; text-align: center;">الرجوع للخلف</a>
        </div>
    `;
    res.send(getLayout(content));
});

// استقبال الملف المرفوع
app.post('/upload', upload.single('subFile'), (req, res) => {
    if (req.file) {
        db.push({
            id: req.body.imdbId,
            url: `https://${req.get('host')}/download/${req.file.filename}`,
            label: req.body.label || "ترجمة عبدالله",
            fileName: req.file.filename,
            date: new Date().toLocaleString('ar-SA')
        });
        saveData();
    }
    res.redirect('/');
});

// صفحة الإدارة وحذف الملفات
app.get('/manage', (req, res) => {
    let rows = db.map((s, index) => `
        <tr style="border-bottom: 1px solid #475569;">
            <td style="padding: 10px;">${s.id}</td>
            <td style="padding: 10px;">${s.label}</td>
            <td style="padding: 10px;">${s.date}</td>
            <td style="padding: 10px;"><a href="/delete/${index}" style="color: #ef4444;">حذف</a></td>
        </tr>
    `).join('');

    const content = `
        <div class="main-card" style="margin: 20px 5%;">
            <h3>📂 إدارة الملفات المرفوعة</h3>
            <table style="width: 100%; border-collapse: collapse; text-align: right;">
                <thead>
                    <tr style="background: #334155;">
                        <th style="padding: 10px;">المعرف (ID)</th>
                        <th style="padding: 10px;">الملصق</th>
                        <th style="padding: 10px;">التاريخ</th>
                        <th style="padding: 10px;">الإجراء</th>
                    </tr>
                </thead>
                <tbody>${rows || '<tr><td colspan="4" style="text-align:center; padding:20px;">لا توجد ملفات مرفوعة</td></tr>'}</tbody>
            </table>
        </div>
    `;
    res.send(getLayout(content));
});

// حذف ملف
app.get('/delete/:index', (req, res) => {
    const idx = req.params.index;
    if (db[idx]) {
        const filePath = path.join(SUB_DIR, db[idx].fileName);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        db.splice(idx, 1);
        saveData();
    }
    res.redirect('/manage');
});

// --- تشغيل الإضافة وسيرفر ستريميو ---
const addonInterface = builder.getInterface();
app.get('/manifest.json', (req, res) => res.json(manifest));
app.get('/subtitles/:type/:id/:extra?.json', (req, res) => {
    addonInterface.get('subtitles', req.params.type, req.params.id)
        .then(resp => res.json(resp))
        .catch(err => {
            console.error(err);
            res.json({ subtitles: [] });
        });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`=============================================`);
    console.log(`🚀 نظام عبدالله جاهز للعمل على المنفذ: ${PORT}`);
    console.log(`📁 مجلد الترجمات: ${SUB_DIR}`);
    console.log(`=============================================`);
});
