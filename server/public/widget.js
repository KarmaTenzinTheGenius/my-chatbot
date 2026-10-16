/* MyChatbot — free embeddable widget. Works on ANY website.
   Usage: <script src="https://YOUR-SERVER/widget.js" data-bot-id="demo-bot"></script>
   Optional: data-server="https://YOUR-SERVER" (defaults to the script's own host)
*/
(function () {
  var script = document.currentScript;
  function attr(n, d) { return (script && script.getAttribute(n)) || d; }
  var BOT_ID = attr('data-bot-id', 'demo-bot');
  var SERVER = (attr('data-server', '') || '').replace(/\/$/, '') ||
    (script && script.src ? new URL(script.src).origin : window.location.origin);

  var sessionId = 's' + Math.random().toString(36).slice(2, 10);
  var history = [];
  var cfg = { name: 'Helper', color: '#4F46E5', greeting: 'Hi! 👋 How can I help?', placeholder: 'Type your message...', position: 'bottom-right' };
  var open = false;

  function el(tag, style, html) {
    var e = document.createElement(tag);
    if (style) e.setAttribute('style', style);
    if (html != null) e.innerHTML = html;
    return e;
  }

  function mount() {
    var right = cfg.position !== 'bottom-left';
    var wrap = el('div',
      'position:fixed;bottom:20px;' + (right ? 'right:20px;' : 'left:20px;') +
      'z-index:999999;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;');
    wrap.id = 'mychatbot-wrap';

    var panel = el('div',
      'display:none;width:min(360px,calc(100vw - 40px));height:480px;max-height:70vh;background:#fff;' +
      'border-radius:16px;box-shadow:0 12px 40px rgba(0,0,0,.25);overflow:hidden;' +
      'flex-direction:column;margin-bottom:12px;');
    panel.id = 'mychatbot-panel';

    var head = el('div',
      'background:' + cfg.color + ';color:#fff;padding:14px 16px;font-weight:600;display:flex;' +
      'align-items:center;justify-content:space-between;',
      '<span>' + escapeHtml(cfg.name) + ' 🟢 online</span><span id="mychatbot-x" style="cursor:pointer">✕</span>');

    var body = el('div', 'flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:8px;background:#f3f4f6;');
    body.id = 'mychatbot-body';

    var form = el('form', 'display:flex;gap:8px;padding:10px;border-top:1px solid #eee;');
    var input = el('input', 'flex:1;border:1px solid #ddd;border-radius:10px;padding:10px;outline:none;');
    input.placeholder = cfg.placeholder;
    var btn = el('button', 'background:' + cfg.color + ';color:#fff;border:0;border-radius:10px;padding:0 16px;cursor:pointer;font-weight:600;', '➤');
    form.appendChild(input); form.appendChild(btn);

    var bubble = el('button',
      'width:60px;height:60px;border-radius:50%;border:0;cursor:pointer;color:#fff;font-size:26px;' +
      'background:' + cfg.color + ';box-shadow:0 8px 24px rgba(0,0,0,.3);float:' + (right ? 'right' : 'left') + ';', '💬');
    bubble.setAttribute('aria-label', 'Open chat');

    panel.appendChild(head); panel.appendChild(body); panel.appendChild(form);
    wrap.appendChild(panel); wrap.appendChild(bubble);
    document.body.appendChild(wrap);

    function toggle(force) {
      open = force != null ? force : !open;
      panel.style.display = open ? 'flex' : 'none';
      bubble.innerHTML = open ? '↓' : '💬';
      if (open) input.focus();
    }
    bubble.onclick = function () { toggle(); };
    head.querySelector('#mychatbot-x').onclick = function () { toggle(false); };

    function bubbleMsg(text, me) {
      var d = el('div',
        'max-width:85%;padding:9px 12px;border-radius:12px;font-size:14px;line-height:1.45;white-space:pre-wrap;' +
        (me ? 'align-self:flex-end;background:' + cfg.color + ';color:#fff;border-bottom-right-radius:4px;'
            : 'align-self:flex-start;background:#fff;color:#111;border-bottom-left-radius:4px;box-shadow:0 1px 2px rgba(0,0,0,.08);'),
        escapeHtml(text));
      body.appendChild(d); body.scrollTop = body.scrollHeight;
      return d;
    }

    bubbleMsg(cfg.greeting, false);
    var typing = null;

    form.onsubmit = function (e) {
      e.preventDefault();
      var text = input.value.trim();
      if (!text) return;
      input.value = '';
      bubbleMsg(text, true);
      history.push({ role: 'user', content: text });
      typing = bubbleMsg('typing…', false);
      fetch(SERVER + '/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ botId: BOT_ID, message: text, sessionId: sessionId, history: history.slice(-8) })
      }).then(function (r) { return r.json(); }).then(function (j) {
        if (typing) typing.remove();
        var reply = j.reply || ('Error: ' + (j.error || 'no reply'));
        bubbleMsg(reply, false);
        history.push({ role: 'assistant', content: reply });
      }).catch(function (err) {
        if (typing) typing.remove();
        bubbleMsg('⚠️ Could not reach the chat server. Check data-server URL.', false);
      });
    };
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  fetch(SERVER + '/api/bots/' + encodeURIComponent(BOT_ID) + '/public')
    .then(function (r) { return r.json(); })
    .then(function (j) { if (!j.error) cfg = Object.assign(cfg, j); mount(); })
    .catch(function () { mount(); });
})();
