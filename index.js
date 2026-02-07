const express = require('express');
const { addonBuilder } = require('stremio-addon-sdk');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const app = express();

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
const subDir = path.join(__dirname, 'subtitles');
if (!fs.existsSync(subDir)) fs.mkdirSync(subDir);

let history = fs.existsSync('data/history.json') ? JSON.parse(fs.readFileSync('data/history.json')) : [];
let db = fs.existsSync('data/db.json') ? JSON.parse(fs.readFileSync('data/db.json')) : [];

const manifest = {
    id: "org.abdullah.community.subs",
    version: "1.0.0",
    name: "Community Subtitles",
    resources: ["subtitles"],
    types: ["movie", "series", "anime"],
    idPrefixes: ["tt", "kitsu"]
};

const builder = new addonBuilder(manifest);

builder.defineSubtitlesHandler(async (args) => {
    try {
        const idParts = args.id.split(':');
        const cleanId = idParts[0];
        let name = "Loading...";
        let poster = `https://images.metahub.space/poster/medium/${cleanId}/img`;

        const res = await axios.get(`https://v3-cinemeta.strem.io/meta/${args.type}/${cleanId.json}`, {timeout: 3000}).catch(()=>{});
        if(res && res.data && res.data.meta) {
            name = res.data.meta.name;
            poster = res.data.meta.poster;
        }

        const entry = {
            id: args.id,
            name: name,
            poster: poster,
            season: idParts[1] || null,
            episode: idParts[2] || null,
            time: new Date().toISOString().split('T')[0] + ' ' + new Date().toLocaleTimeString()
        };

        history = [entry, ...history.filter(h => h.id !== args.id)].slice(0, 5);
        fs.writeFileSync('data/history.json', JSON.stringify(history));
    } catch (e) {}
    return Promise.resolve({ subtitles: db.filter(s => s.id === args.id) });
});

// التصميم المطابق للصورة (CSS)
const dashboardStyle = `
<style>
    body { background: #f4f7f6; font-family: 'Segoe UI', sans-serif; margin: 0; color: #333; }
    .navbar { background: #1e293b; color: white; padding: 10px 50px; display: flex; align-items: center; }
    .container { display: flex; max-width: 1200px; margin: 30px auto; gap: 20px; }
    .main-content { flex: 3; }
    .sidebar { flex: 1; }
    .card { background: white; border-radius: 8px; border: 1px solid #ddd; margin-bottom: 20px; overflow: hidden; }
    .card-header { background: #f8f9fa; padding: 10px 15px; border-bottom: 1px solid #ddd; font-weight: bold; display: flex; justify-content: space-between; }
    .item { display: flex; padding: 15px; border-bottom: 1px solid #eee; align-items: center; }
    .item img { width: 40px; height: 60px; border-radius: 4px; margin-right: 15px; }
    .item-info { flex-grow: 1; }
    .item-info h4 { margin: 0; font-size: 14px; color: #2563eb; }
    .tag { font-size: 10px; padding: 2px 6px; border-radius: 3px; background: #fbbf24; color: white; }
    .btn-blue { background: #2563eb; color: white; border: none; padding: 10px; border-radius: 5px; cursor: pointer; text-decoration: none; display: block; text-align: center; }
    .stats-row { display: flex; justify-content: space-between; padding: 10px; border-bottom: 1px solid #eee; font-size: 13px; }
    .badge { background: #2563eb; color: white; padding: 2px 8px; border-radius: 10px; font-size: 11px; }
</style>
`;

app.get('/', (req, res) => {
    let rows = history.map(h => `
        <div class="item">
            <img src="${h.poster}">
            <div class="item-info">
                <h4>${h.name} ${h.season ? `S${h.season} - Ep ${h.episode}` : ''}</h4>
                <span class="tag">Series</span> <small style="background:#333; color:white; padding:2px 4px; border-radius:3px;">ID: ${h.id}</small>
            </div>
            <div style="text-align:right">
                <small>${h.time}</small><br>
                <a href="/upload-page/${h.id}" style="color:red; text-decoration:none;">📁</a>
            </div>
        </div>
    `).join('');

    res.send(`${dashboardStyle}
        <div class="navbar"><strong>CC Community Subtitles</strong> &nbsp;&nbsp; Dashboard &nbsp;&nbsp; Install Addon</div>
        <div class="container">
            <div class="main-content">
                <h1>Your Dashboard</h1>
                <div class="card">
                    <div class="card-header">Recent Activity <span class="badge">${history.length} items</span></div>
                    <div style="padding:10px;"><small>We store only your last 5 activities.</small></div>
                    ${rows || '<p style="padding:20px;">No activity yet...</p>'}
                </div>
            </div>
            <div class="sidebar">
                <div class="card" style="border-top: 4px solid #16a34a;">
                    <div class="card-header">Addon Installation</div>
                    <div style="padding:15px;">
                        <p><small>Install the addon in Stremio to start.</small></p>
                        <a href="stremio://${req.get('host')}/manifest.json" class="btn-blue">Install Addon</a>
                    </div>
                </div>
                <div class="card" style="border-top: 4px solid #0891b2;">
                    <div class="card-header" style="background:#0891b2; color:white;">Your Stats</div>
                    <div class="stats-row">Uploaded Subtitles <span class="badge">${db.length}</span></div>
                    <div class="stats-row">Selected Subtitles <span class="badge">${db.length}</span></div>
                </div>
            </div>
        </div>
    `);
});

// باقي المسارات (upload, manifest, etc.) تبقى كما هي...
app.get('/manifest.json', (req, res) => { res.setHeader('Access-Control-Allow-Origin', '*'); res.json(manifest); });
app.listen(process.env.PORT || 3000);
