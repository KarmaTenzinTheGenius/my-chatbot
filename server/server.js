require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

app.use(cors({ origin: '*' })); // widget must work from ANY website
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ---------- tiny JSON store (free, no database needed) ----------
function load(file, fallback) {
  try {
    const p = path.join(DATA_DIR, file);
    if (!fs.existsSync(p)) return fallback;
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch { return fallback; }
}
function save(file, data) {
  fs.writeFileSync(path.join(DATA_DIR, file), JSON.stringify(data, null, 2));
}
let bots = load('bots.json', null);
if (!bots) bots = load('bots.seed.json', null); // preloaded Bhutan FAQ knowledge (for fresh deploys)
if (!bots) {
  bots = [{
    id: 'demo-bot',
    name: 'Helper',
    color: '#4F46E5',
    greeting: 'Hi! 👋 How can I help you today?',
    placeholder: 'Type your message...',
    position: 'bottom-right',
    knowledge: [
      { q: 'What are your opening hours?', a: 'We are open Mon–Sat, 9am to 6pm.' },
      { q: 'Where are you located?', a: 'We are in Thimphu, Bhutan. You can change this answer in the dashboard.' },
      { q: 'How can I contact you?', a: 'Just type your question here, or email us — update this in the dashboard.' },
      { q: 'What do you sell?', a: 'Describe your products/services in the dashboard and I will answer automatically.' }
    ]
  }];
  save('bots.json', bots);
}
let chats = load('chats.json', []);

// ---------- helpers ----------
const uid = () => Math.random().toString(36).slice(2, 10);
function norm(s) { return (s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' '); }
function stem(w) {
  if (w.length > 5 && w.endsWith('ies')) return w.slice(0, -3) + 'y';
  if (w.length > 6 && w.endsWith('ing')) return w.slice(0, -3);
  if (w.length > 5 && w.endsWith('ed')) return w.slice(0, -2);
  if (w.length > 5 && w.endsWith('ery')) return w.slice(0, -3) + 'er'; // delivery -> deliver
  if (w.length > 4 && w.endsWith('es') && !w.endsWith('sses')) return w.slice(0, -2);
  if (w.length > 4 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
}
function toks(s) { return norm(s).split(/\s+/).filter(w => w.length > 2).map(stem); }
function score(msg, q) {
  const m = toks(msg), qq = toks(q);
  if (!qq.length || !m.length) return 0;
  const set = new Set(m);
  let hit = 0; qq.forEach(w => { if (set.has(w)) hit++; });
  // best of question-coverage and message-coverage (short queries like "gho size" still match)
  return Math.max(hit / qq.length, hit / m.length);
}

// ---------- FREE BRAIN (pick first available, $0 options first) ----------
async function brainReply(bot, message, history = []) {
  // 1) Groq — generous FREE tier (https://console.groq.com, no card)
  if (process.env.GROQ_API_KEY) {
    try { return await groqReply(bot, message, history); } catch (e) { console.log('Groq fail, falling back:', e.message); }
  }
  // 2) Gemini — FREE tier (https://aistudio.google.com, no card)
  if (process.env.GEMINI_API_KEY) {
    try { return await geminiReply(bot, message, history); } catch (e) { console.log('Gemini fail, falling back:', e.message); }
  }
  // 3) OpenAI — only if user adds a key later (optional, not required)
  if (process.env.OPENAI_API_KEY) {
    try { return await openaiReply(bot, message, history); } catch (e) { console.log('OpenAI fail, falling back:', e.message); }
  }
  // 4) Ollama — 100% free local LLM (optional, runs offline)
  if (process.env.OLLAMA_URL) {
    try { return await ollamaReply(bot, message, history); } catch (e) { console.log('Ollama fail, falling back:', e.message); }
  }
  // 5) Built-in smart FAQ engine — always works, $0, no key needed
  return localReply(bot, message);
}

function systemPrompt(bot) {
  const kb = (bot.knowledge || []).map(k => `Q: ${k.q}\nA: ${k.a}`).join('\n\n');
  return `You are "${bot.name}", a helpful assistant on a website. Be short, friendly, helpful. Use this business info when relevant:\n${kb || '(no business info added yet)'}`;
}

async function groqReply(bot, message, history) {
  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'system', content: systemPrompt(bot) },
        ...history.slice(-8).map(h => ({ role: h.role, content: h.content })),
        { role: 'user', content: message }],
      temperature: 0.7, max_tokens: 400
    })
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error?.message || 'groq error');
  return j.choices[0].message.content;
}

async function geminiReply(bot, message, history) {
  const key = process.env.GEMINI_API_KEY;
  const hist = history.slice(-8).map(h => ({ role: h.role === 'assistant' ? 'model' : 'user', parts: [{ text: h.content }] }));
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ system_instruction: { parts: [{ text: systemPrompt(bot) }] }, contents: [...hist, { role: 'user', parts: [{ text: message }] }] })
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error?.message || 'gemini error');
  return j.candidates[0].content.parts.map(p => p.text).join('');
}

async function openaiReply(bot, message, history) {
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'system', content: systemPrompt(bot) },
        ...history.slice(-8), { role: 'user', content: message }],
      temperature: 0.7, max_tokens: 400
    })
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error?.message || 'openai error');
  return j.choices[0].message.content;
}

async function ollamaReply(bot, message) {
  const base = (process.env.OLLAMA_URL || 'http://localhost:11434').replace(/\/$/, '');
  const r = await fetch(`${base}/api/chat`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: process.env.OLLAMA_MODEL || 'llama3.1', stream: false,
      messages: [{ role: 'system', content: systemPrompt(bot) }, { role: 'user', content: message }] })
  });
  const j = await r.json();
  if (!r.ok) throw new Error('ollama error');
  return j.message.content;
}

// Built-in engine: FAQ match + small talk. Works offline, $0.
function localReply(bot, message) {
  const m = norm(message);
  if (/^(hi|hello|hey|kuzu|good (morning|afternoon|evening))\b/.test(m))
    return `${bot.greeting} Ask me about our hours, location, services or prices.`;
  if (m.includes('thank')) return "You're welcome! 😊 Anything else I can help with?";
  if (m.includes('bye')) return 'Goodbye! 👋 Have a great day.';

  // FAQ match FIRST so real answers always beat generic fallbacks
  let best = null, bestScore = 0;
  for (const k of (bot.knowledge || [])) {
    const s = score(message, k.q);
    if (s > bestScore) { bestScore = s; best = k; }
  }
  if (best && bestScore >= 0.25) return best.a;

  // generic fallbacks only when no FAQ matched
  if (/\b(prices?|pricing|costs?|rates?|fees?|how much)\b/.test(m)
    || m.includes('delivery charge') || m.includes('shipping charge')
    || m.includes('extra charge') || m.includes('hidden charge'))
    return 'Prices depend on what you need. Add your price list in the dashboard (Knowledge) and I will answer instantly.';
  if (m.includes('human') || m.includes('real person') || /\bcall\b/.test(m) || m.includes('phone') || m.includes('contact'))
    return 'You can reach our team — update your contact details in the dashboard under Knowledge, and I will share them here.';

  const topics = (bot.knowledge || []).map(k => `• ${k.q}`).join('\n');
  return `I'm not sure about that yet — but I'm learning! 🌱\n${topics ? `Here's what I CAN answer:\n${topics}` : 'Ask the site owner to add answers in the dashboard under Knowledge.'}`;
}

// ---------- API ----------
app.get('/api/health', (req, res) => {
  const engine = process.env.GROQ_API_KEY ? 'groq (free tier)' :
    process.env.GEMINI_API_KEY ? 'gemini (free tier)' :
    process.env.OPENAI_API_KEY ? 'openai' :
    process.env.OLLAMA_URL ? 'ollama (local, free)' : 'built-in (free, no key)';
  res.json({ ok: true, engine, bots: bots.length, chats: chats.length });
});

app.get('/api/bots', (req, res) => res.json(bots));
app.post('/api/bots', (req, res) => {
  const b = { id: uid(), name: 'New Bot', color: '#4F46E5', greeting: 'Hi! How can I help?',
    placeholder: 'Type your message...', position: 'bottom-right', knowledge: [], ...req.body };
  bots.push(b); save('bots.json', bots); res.json(b);
});
app.put('/api/bots/:id', (req, res) => {
  const i = bots.findIndex(b => b.id === req.params.id);
  if (i < 0) return res.status(404).json({ error: 'not found' });
  bots[i] = { ...bots[i], ...req.body, id: bots[i].id };
  save('bots.json', bots); res.json(bots[i]);
});
app.delete('/api/bots/:id', (req, res) => {
  bots = bots.filter(b => b.id !== req.params.id);
  save('bots.json', bots); res.json({ ok: true });
});
// public safe config for widget
app.get('/api/bots/:id/public', (req, res) => {
  const b = bots.find(x => x.id === req.params.id);
  if (!b) return res.status(404).json({ error: 'bot not found' });
  const { id, name, color, greeting, placeholder, position } = b;
  res.json({ id, name, color, greeting, placeholder, position });
});

// THE chat endpoint — call from any website / app / software
app.post('/api/chat', async (req, res) => {
  const { botId, message, sessionId, history } = req.body || {};
  if (!message || !message.trim()) return res.status(400).json({ error: 'message required' });
  const bot = bots.find(b => b.id === (botId || 'demo-bot')) || bots[0];
  if (!bot) return res.status(404).json({ error: 'no bots configured' });
  try {
    const reply = await brainReply(bot, message.trim(), history || []);
    const sid = sessionId || uid();
    chats.push({ id: uid(), botId: bot.id, sessionId: sid, at: new Date().toISOString(), q: message.trim(), a: reply });
    if (chats.length > 2000) chats = chats.slice(-2000);
    save('chats.json', chats);
    res.json({ reply, sessionId: sid, bot: bot.name });
  } catch (e) {
    res.status(500).json({ error: 'brain failed: ' + e.message });
  }
});

app.get('/api/chats', (req, res) => {
  const { botId } = req.query;
  const list = (botId ? chats.filter(c => c.botId === botId) : chats).slice(-200).reverse();
  res.json(list);
});

app.listen(PORT, () => console.log(`✅ FREE chatbot server on http://localhost:${PORT}\n   Dashboard: http://localhost:${PORT}/admin.html\n   Demo site:   http://localhost:${PORT}/demo.html`));
