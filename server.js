require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const fetch = require('node-fetch');
const Datastore = require('nedb');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

if (!fs.existsSync('./data')) fs.mkdirSync('./data');
const db = new Datastore({ filename: './data/prospects.db', autoload: true });
db.ensureIndex({ fieldName: 'createdAt' });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: process.env.SESSION_SECRET || 'infinite_secret_key',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }
}));

function requireAuth(req, res, next) {
  if (req.session && req.session.authenticated) return next();
  res.status(401).json({ error: 'Neautentificat' });
}

app.get('/', (req, res) => {
  if (req.session && req.session.authenticated) {
    res.sendFile(path.join(__dirname, 'public', 'app.html'));
  } else {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
  }
});

app.post('/api/login', (req, res) => {
  const { password } = req.body;
  if (password === (process.env.APP_PASSWORD || 'infinite2025')) {
    req.session.authenticated = true;
    res.json({ success: true });
  } else {
    res.status(401).json({ error: 'Parolă incorectă' });
  }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

app.post('/api/analyze', requireAuth, async (req, res) => {
  const { input } = req.body;
  if (!input || !input.trim()) return res.status(400).json({ error: 'Input invalid' });

  const prompt = `Ești un agent de prospectare pentru INFINITE Studio, agenție de marketing digital fondată de Darius din România.

Analizează această firmă: "${input}"

PARCURGE TOȚI PAȘII OBLIGATORIU:

PASUL 1 — CERCETARE COMPLETĂ
Caută activ: website, Facebook, Instagram, TikTok, LinkedIn, Google Business, recenzii Google, reclame Meta active. Caută: "${input} website", "${input} facebook", "${input} recenzii".

PASUL 2 — SCOR POTENȚIAL (1-10)
+ Prezență online slabă/lipsă = scor ridicat
+ Domeniu cu buget (construcții, auto, imobiliare, beauty, HoReCa, medical, fitness, juridic) = +2
+ Firmă activă dar complet absent online = +3
+ Concurenți activi online dar ei nu = +2
+ Recenzii bune dar fără social media = +1
- Firmă abandonată = scor scăzut
- Domeniu cu buget mic = -2

PASUL 3 — ANALIZĂ DETALIATĂ
Social media: frecvență postări, calitate vizuală, branding, reels, CTA, interacțiune
Website: viteză (rapid/mediu/lent), SEO (titlu, meta, structură, headings), calitate design, conținut lipsă, optimizare mobil
Recenzii: scor, număr, ce spun clienții concret, dacă proprietarul răspunde
Platforme complet absente

PASUL 4 — DATE INSUFICIENTE
Dacă nu ai găsit informații reale suficiente: insufficient: true

PASUL 5 — SERVICII RECOMANDATE
Selectează DOAR serviciile relevante pentru problemele găsite:
Brand Identity Basic €100-200, Design materiale €50-120, Landing Page €250-350, Website Business €400-600, Strategie Social Media €70-120, Content Strategy €50-100, SM Management Basic €150/lună, SM Management Growth €200/lună, SM Management Premium €300/lună, Reels Basic €40-60, Reels Premium €70-100, Meta Ads Setup €50-100, Meta Ads Management €100-200/lună, Audit prezență online €50-100

PASUL 6 — MESAJ PERSONALIZAT
Mesaj profesional dar prietenos, în română, de la Darius — fondator INFINITE Studio.
1. Deschidere caldă cu observație specifică și reală despre ei
2. 2-3 probleme concrete identificate, scurt și direct
3. Soluțiile concrete INFINITE cu prețurile fixe
4. CTA: să scrie sau sune la 0746 064 909
5. Semnătură: Darius | INFINITE Studio
NU folosi clișee, NU fi generic, FII specific și convingător.

Răspunde EXCLUSIV în JSON valid, fără alt text:
{
  "companyName": "numele firmei",
  "domain": "domeniu activitate",
  "insufficient": false,
  "score": 7,
  "scoreReason": "explicație 1-2 propoziții",
  "platforms": {
    "website": "found|missing|partial",
    "facebook": "found|missing|partial",
    "instagram": "found|missing|partial",
    "tiktok": "found|missing|partial",
    "googleBusiness": "found|missing|partial",
    "metaAds": "found|missing|partial"
  },
  "websiteDetails": {
    "url": "url sau null",
    "speed": "rapid|mediu|lent|necunoscut",
    "seoScore": "bun|mediu|slab|absent",
    "seoIssues": ["problemă1", "problemă2"],
    "missingContent": ["ce lipsește"]
  },
  "problems": [
    {"title": "titlu", "desc": "descriere concretă", "severity": "mare|medie|mică"}
  ],
  "positives": [
    {"title": "titlu", "desc": "descriere"}
  ],
  "reviews": {
    "score": "4.2",
    "count": "23",
    "sentiment": "ce spun clienții",
    "ownerResponds": true
  },
  "recommendedServices": [
    {"name": "nume serviciu", "price": "preț", "why": "de ce pentru această firmă"}
  ],
  "estimatedTotal": "estimare totală",
  "message": "mesajul complet"
}`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'web-search-2025-03-05'
      },
      body: JSON.stringify({
        model: 'claude-opus-4-5',
        max_tokens: 4000,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const data = await response.json();
    if (data.error) return res.status(500).json({ error: data.error.message });

    let text = '';
    for (const block of (data.content || [])) {
      if (block.type === 'text') text += block.text;
    }

    const clean = text.replace(/```json|```/g, '').trim();
    const jsonMatch = clean.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return res.status(500).json({ error: 'Format răspuns invalid de la AI' });

    const result = JSON.parse(jsonMatch[0]);

    if (!result.insufficient) {
      const doc = {
        companyName: result.companyName || input,
        domain: result.domain || '',
        inputQuery: input,
        score: result.score || 0,
        scoreReason: result.scoreReason || '',
        platforms: result.platforms || {},
        problems: result.problems || [],
        positives: result.positives || [],
        reviews: result.reviews || {},
        recommendedServices: result.recommendedServices || [],
        message: result.message || '',
        status: 'necontactat',
        note: '',
        createdAt: new Date()
      };
      db.insert(doc, (err, newDoc) => {
        if (!err) result.dbId = newDoc._id;
        res.json(result);
      });
    } else {
      res.json(result);
    }

  } catch(err) {
    console.error('Error:', err);
    res.status(500).json({ error: 'Eroare server: ' + err.message });
  }
});

app.get('/api/prospects', requireAuth, (req, res) => {
  const { status, search } = req.query;
  let query = {};
  if (status && status !== 'all') query.status = status;
  if (search) query.companyName = new RegExp(search, 'i');
  db.find(query).sort({ createdAt: -1 }).exec((err, docs) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(docs.map(d => ({ ...d, id: d._id })));
  });
});

app.patch('/api/prospects/:id', requireAuth, (req, res) => {
  const { status, note } = req.body;
  const update = { $set: {} };
  if (status !== undefined) update.$set.status = status;
  if (note !== undefined) update.$set.note = note;
  update.$set.updatedAt = new Date();
  db.update({ _id: req.params.id }, update, {}, (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

app.delete('/api/prospects/:id', requireAuth, (req, res) => {
  db.remove({ _id: req.params.id }, {}, (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

app.get('/api/stats', requireAuth, (req, res) => {
  db.find({}, (err, docs) => {
    if (err) return res.status(500).json({ error: err.message });
    const total = docs.length;
    const byStatusMap = {};
    let scoreSum = 0;
    docs.forEach(d => {
      byStatusMap[d.status] = (byStatusMap[d.status] || 0) + 1;
      scoreSum += parseInt(d.score) || 0;
    });
    const byStatus = Object.entries(byStatusMap).map(([status, c]) => ({ status, c }));
    res.json({ total, byStatus, avgScore: total ? Math.round(scoreSum / total) : 0 });
  });
});

app.listen(PORT, () => console.log(`INFINITE Prospector pe portul ${PORT}`));
