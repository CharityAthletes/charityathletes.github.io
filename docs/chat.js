// Charity Athletes Support Chat Widget
(function() {
  const API_URL = 'https://charityathletes-production.up.railway.app/chat';
  let history = [];
  let isOpen = false;

  // Detect language
  const isEn = () => document.body.classList.contains('en');

  const strings = {
    title: () => isEn() ? 'Support Chat' : 'サポートチャット',
    subtitle: () => isEn() ? 'Ask anything about Charity Athletes' : 'チャリアスについて何でも聞いてください',
    placeholder: () => isEn() ? 'Type your question...' : '質問を入力してください...',
    send: () => isEn() ? 'Send' : '送信',
    greeting: () => isEn()
      ? 'Hi! 👋 I\'m the Charity Athletes support assistant. How can I help you today?'
      : 'こんにちは！👋 チャリアスのサポートアシスタントです。何かお手伝いできますか？',
    error: () => isEn() ? 'Sorry, something went wrong. Please try again.' : 'エラーが発生しました。もう一度お試しください。',
    thinking: () => isEn() ? 'Thinking...' : '考え中...',
  };

  // Inject styles
  const style = document.createElement('style');
  style.textContent = `
    #ca-chat-btn {
      position: fixed; bottom: 24px; right: 24px; z-index: 9999;
      width: 56px; height: 56px; border-radius: 50%;
      background: linear-gradient(135deg, #007B83, #009CA6);
      border: none; cursor: pointer;
      box-shadow: 0 4px 16px rgba(0,123,131,0.4);
      display: flex; align-items: center; justify-content: center;
      transition: transform 0.2s, box-shadow 0.2s;
      color: white; font-size: 24px;
    }
    #ca-chat-btn:hover { transform: scale(1.08); box-shadow: 0 6px 20px rgba(0,123,131,0.5); }

    #ca-chat-window {
      position: fixed; bottom: 92px; right: 24px; z-index: 9999;
      width: 340px; max-width: calc(100vw - 48px);
      background: white; border-radius: 16px;
      box-shadow: 0 8px 40px rgba(0,0,0,0.15);
      display: none; flex-direction: column;
      overflow: hidden; font-family: -apple-system, BlinkMacSystemFont, 'Hiragino Sans', sans-serif;
      height: 480px; max-height: calc(100vh - 120px);
    }
    #ca-chat-window.open { display: flex; }

    #ca-chat-header {
      background: linear-gradient(135deg, #1565C0, #2E7D32);
      color: white; padding: 14px 16px;
      display: flex; align-items: center; gap: 10px;
    }
    #ca-chat-header img { width: 32px; height: 32px; border-radius: 8px; }
    #ca-chat-header-text { flex: 1; }
    #ca-chat-header-title { font-size: 14px; font-weight: 700; }
    #ca-chat-header-sub { font-size: 11px; opacity: 0.8; margin-top: 1px; }
    #ca-chat-close {
      background: none; border: none; color: white;
      font-size: 20px; cursor: pointer; opacity: 0.8; padding: 0;
      line-height: 1;
    }
    #ca-chat-close:hover { opacity: 1; }

    #ca-chat-messages {
      flex: 1; overflow-y: auto; padding: 16px;
      display: flex; flex-direction: column; gap: 10px;
    }
    .ca-msg {
      max-width: 85%; padding: 10px 12px; border-radius: 12px;
      font-size: 13px; line-height: 1.5; word-break: break-word;
    }
    .ca-msg-bot {
      background: #f0f0f0; color: #1a1a1a;
      align-self: flex-start; border-bottom-left-radius: 4px;
    }
    .ca-msg-user {
      background: linear-gradient(135deg, #007B83, #009CA6);
      color: white; align-self: flex-end; border-bottom-right-radius: 4px;
    }
    .ca-msg-thinking { opacity: 0.6; font-style: italic; }

    #ca-chat-input-row {
      padding: 12px; border-top: 1px solid #eee;
      display: flex; gap: 8px; align-items: flex-end;
    }
    #ca-chat-input {
      flex: 1; border: 1.5px solid #eee; border-radius: 10px;
      padding: 8px 12px; font-size: 13px; resize: none;
      font-family: inherit; outline: none; max-height: 80px;
      line-height: 1.4;
    }
    #ca-chat-input:focus { border-color: #007B83; }
    #ca-chat-send {
      background: linear-gradient(135deg, #007B83, #009CA6);
      color: white; border: none; border-radius: 10px;
      padding: 8px 14px; font-size: 13px; font-weight: 600;
      cursor: pointer; white-space: nowrap;
      transition: opacity 0.2s;
    }
    #ca-chat-send:hover { opacity: 0.9; }
    #ca-chat-send:disabled { opacity: 0.5; cursor: not-allowed; }
  `;
  document.head.appendChild(style);

  // Create button
  const btn = document.createElement('button');
  btn.id = 'ca-chat-btn';
  btn.innerHTML = '💬';
  btn.title = 'Support Chat';
  document.body.appendChild(btn);

  // Create window
  const win = document.createElement('div');
  win.id = 'ca-chat-window';
  win.innerHTML = `
    <div id="ca-chat-header">
      <img src="icon.png" alt="チャリアス"/>
      <div id="ca-chat-header-text">
        <div id="ca-chat-header-title"></div>
        <div id="ca-chat-header-sub"></div>
      </div>
      <button id="ca-chat-close">✕</button>
    </div>
    <div id="ca-chat-messages"></div>
    <div id="ca-chat-input-row">
      <textarea id="ca-chat-input" rows="1" maxlength="1000"></textarea>
      <button id="ca-chat-send"></button>
    </div>
  `;
  document.body.appendChild(win);

  const messagesEl = document.getElementById('ca-chat-messages');
  const inputEl = document.getElementById('ca-chat-input');
  const sendEl = document.getElementById('ca-chat-send');

  function updateStrings() {
    document.getElementById('ca-chat-header-title').textContent = strings.title();
    document.getElementById('ca-chat-header-sub').textContent = strings.subtitle();
    inputEl.placeholder = strings.placeholder();
    sendEl.textContent = strings.send();
  }

  function addMessage(text, type) {
    const msg = document.createElement('div');
    msg.className = `ca-msg ca-msg-${type}`;
    msg.textContent = text;
    messagesEl.appendChild(msg);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return msg;
  }

  function openChat() {
    isOpen = true;
    win.classList.add('open');
    btn.innerHTML = '✕';
    updateStrings();
    if (messagesEl.children.length === 0) {
      addMessage(strings.greeting(), 'bot');
    }
    inputEl.focus();
  }

  function closeChat() {
    isOpen = false;
    win.classList.remove('open');
    btn.innerHTML = '💬';
  }

  btn.addEventListener('click', () => isOpen ? closeChat() : openChat());
  document.getElementById('ca-chat-close').addEventListener('click', closeChat);

  async function sendMessage() {
    const text = inputEl.value.trim();
    if (!text) return;

    inputEl.value = '';
    inputEl.style.height = 'auto';
    sendEl.disabled = true;

    addMessage(text, 'user');
    const thinkingMsg = addMessage(strings.thinking(), 'bot ca-msg-thinking');

    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history }),
      });

      const data = await res.json();
      thinkingMsg.remove();

      if (data.reply) {
        addMessage(data.reply, 'bot');
        history.push({ role: 'user', content: text });
        history.push({ role: 'assistant', content: data.reply });
        if (history.length > 20) history = history.slice(-20);
      } else {
        addMessage(strings.error(), 'bot');
      }
    } catch (e) {
      thinkingMsg.remove();
      addMessage(strings.error(), 'bot');
    }

    sendEl.disabled = false;
    inputEl.focus();
  }

  sendEl.addEventListener('click', sendMessage);
  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  // Auto-resize textarea
  inputEl.addEventListener('input', () => {
    inputEl.style.height = 'auto';
    inputEl.style.height = Math.min(inputEl.scrollHeight, 80) + 'px';
  });

  // Update strings when language toggles
  const origToggle = window.toggleLang;
  window.toggleLang = function() {
    if (origToggle) origToggle();
    updateStrings();
  };
})();
