const express = require('express');
const { addonBuilder } = require('stremio-addon-sdk');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const app = express();

// إعداد التخزين
if (!fs.existsSync('data')) fs.mkdirSync('data');
let history = fs.existsSync('data/h.json') ? JSON.parse(fs.readFileSync('data/h.json')) : [];

// المانيفست - أضفنا [] للـ catalogs لإصلاح الخطأ في الصورة
const manifest = {
    id: "org.abdullah.community",
    version: "1.0.0",
    name: "Community Subtitles",
    description: "Your Dashboard for subtitles",
    resources: ["subtitles"],
    types: ["movie", "series"],
    idPrefixes: ["tt", "kitsu"],
    catalogs: [] // لا تتركها فارغة، يجب أن تكون مصفوفة هكذا
};

const builder = new addonBuilder(manifest);

builder.defineSubtitlesHandler(async (args) => {
    const idParts = args.id.split(':');
    try {
        // جلب بيانات من سينيميتا لملء القائمة
        const res = await axios.get(`https://v3-cinemeta.strem.io/meta/${args.type}/${idParts[0]}.json`);
        const meta = res.data.meta;
        const entry = {
            id: args.id,
            name: meta.name,
            poster: meta.poster,
            info: args.id.includes(':') ? `S${idParts[1]} - E${idParts[2]}` : 'Movie',
            time: new Date().toLocaleString('en-GB')
        };
        history = [entry, ...history.filter(x => x.id !== args.id)].slice(0, 5);
        fs.writeFileSync('data/h.json', JSON.stringify(history));
    } catch (e) {}
    return { subtitles: [] }; 
});

// التصميم (UI) مطابق للصورة
const dashboardHTML = (req) => `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { background: #f4f7f9; font-family: 'Segoe UI', sans-serif; margin: 0; }
        .header { background: #1e293b; color: white; padding: 10px 40px; display: flex; align-items: center; font-size: 14px; }
        .container { max-width: 1100px; margin: 30px auto; display: flex; gap: 20px; padding: 0 20px; }
        .main { flex: 3; }
        .side { flex: 1; }
        .card { background: white; border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 20px; overflow: hidden; }
        .card-header { background: #f8fafc; padding: 12px 15px; border-bottom: 1px solid #e2e8f0; font-weight: bold; display: flex; justify-content: space-between; }
        .item { display: flex; padding: 15px; border-bottom: 1px solid #f1f5f9; align-items: center; }
        .item img { width: 45px; height: 65px; border-radius: 4px; margin-right: 15px; object-fit: cover; }
        .tag { background: #fbbf24; color: #000; font-size: 10px; padding: 2px 6px; border-radius: 4px; margin-right: 5px; }
        .btn-install { background: #2563eb; color: white; text-align: center; padding: 12px; display: block; text-decoration: none; border-radius: 6px; margin-top: 10px; font-weight: bold; }
        .stat-box { padding: 10px 15px; display: flex; justify-content: space-between; border-bottom: 1px solid #f1f5f9; font-size: 13px; color: #475569; }
        .badge { background: #2563eb; color: white; padding: 2px 8px; border-radius: 12px; font-size: 11px; }
    </style>
</head>
<body>
    <div class="header">CC <b>Community Subtitles</b> &nbsp;&nbsp;&nbsp; Dashboard &nbsp;&nbsp; Install Addon</div>
    <div class="container">
        <div class="main">
            <h1 style="font-size: 28px; margin-top: 0;">Your Dashboard</h1>
            <p style="color: #64748b;">Welcome back! Here's your recent activity.</p>
            <div class="card">
                <div class="card-header">Recent Activity <span class="badge">5 items</span></div>
                ${history.map(h => `
                    <div class="item">
                        <img src="${h.poster}">
                        <div style="flex:1">
                            <div style="font-weight: bold; color: #1e293b;">${h.name} (${h.info})</div>
                            <span class="tag">Series</span> <small style="color:#94a3b8">ID: ${h.id}</small>
                        </div>
                        <div style="text-align: right; color: #94a3b8; font-size: 12px;">${h.time}</div>
                    </div>
                `).join('') || '<p style="padding:20px;">No activity yet. Watch something in Stremio!</p>'}
            </div>
        </div>
        <div class="side">
            <div class="card" style="border-top: 4px solid #16a34a;">
                <div class="card-header">Addon Installation</div>
                <div style="padding: 15px; font-size: 13px; color: #475569;">
                    Install the addon in Stremio to start using community subtitles.
                    <a href="stremio://${req.get('host')}/manifest.json" class="btn-install">Install Addon</a>
                </div>
            </div>
            <div class="card" style="border-top: 4px solid #0ea5e9;">
                <div class="card-header" style="background:#0ea5e9; color:white;">Your Stats</div>
                <div class="stat-box">Uploaded Subtitles <span class="badge">0</span></div>
                <div class="stat-box">Selected Subtitles <span class="badge">${history.length}</span></div>
            </div>
        </div>
    </div>
</body>
</html>
`;

app.get('/', (req, res) => res.send(dashboardHTML(req)));
app.get('/manifest.json', (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.json(manifest);
});

// المسار الذي يحتاجه ستريميو للربط
app.get('/subtitles/:type/:id/:extra?.json', (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.json({ subtitles: [] });
});

app.listen(process.env.PORT || 3000, () => console.log("Addon is ready!"));
