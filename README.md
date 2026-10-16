# 🤖 MyChatbot — 100% FREE self-hosted chatbot platform

Embed on **any website, app, or software**. No paid services. Ever.

## 1. Run it (free)

```bash
cd server
npm install
npm start
```

Open:
- **Demo site:** http://localhost:3001/demo.html (widget live, bottom-right)
- **Admin:** http://localhost:3001/admin.html (edit name, color, Q&A, copy embed code, see chats)

## 2. How it answers (all free)

| Engine | Cost | Setup |
|---|---|---|
| Built-in FAQ engine (default) | **$0, no key, works offline** | nothing — answers from Knowledge Q&A you add in admin |
| Groq (Llama 3.3, smart AI) | **$0 free tier, no card** | free key at console.groq.com → `.env`: `GROQ_API_KEY=gsk_...` |
| Gemini Flash (Google, smart AI) | **$0 free tier, no card** | free key at aistudio.google.com → `.env`: `GEMINI_API_KEY=...` |
| Ollama (runs on your PC, offline) | **$0** | install ollama + `.env`: `OLLAMA_URL=http://localhost:11434` |

Priority: Groq → Gemini → OpenAI (optional) → Ollama → built-in. First available key wins; otherwise built-in.

`.env` example (create `server/.env`):
```
PORT=3001
GROQ_API_KEY=gsk_your_free_key_here
# GEMINI_API_KEY=your_free_key_here
# OLLAMA_URL=http://localhost:11434
```

## 3. Embed on ANY website — 1 line

```html
<script src="https://YOUR-SERVER/widget.js" data-bot-id="demo-bot"></script>
```

Works on WordPress, Wix, Shopify, plain HTML, React, anything. Optional: `data-server="https://YOUR-SERVER"`.

## 4. Use from apps / mobile / any software — REST API

```http
POST https://YOUR-SERVER/api/chat
Content-Type: application/json

{"botId":"demo-bot","message":"Hello!","sessionId":"user-123","history":[]}
```

Other endpoints: `GET /api/bots/:id/public` (widget config), `POST /api/bots`, `PUT /api/bots/:id`, `GET /api/chats?botId=...`, `GET /api/health`.

## 5. Put it on the internet FREE

- **Render.com** free tier: connect repo → `npm start` in `server/` → paste your `https://xxx.onrender.com/widget.js` snippet anywhere.
- **Railway / Fly.io / Oracle Cloud** free tiers also work.
- Data is JSON files in `server/data/` — back them up or swap in Postgres later (schema-free JSON).

## Files

```
server/
  server.js          backend + API
  package.json
  public/
    widget.js        embeddable chat bubble (the 1-line integration)
    admin.html       dashboard: bots, colors, knowledge, embed code, chat history
    demo.html        fake website proving the widget works anywhere
  data/              bots.json + chats.json (auto-created)
```
