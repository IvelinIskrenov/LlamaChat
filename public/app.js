const messagesEl = document.getElementById('messages');
const historyListEl = document.getElementById('historyList');
const chatForm = document.getElementById('chatForm');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const newChatBtn = document.getElementById('newChatBtn');
const statusText = document.getElementById('statusText');
const modelInput = document.getElementById('modelInput');

let history = [];
let activeEntryId = null;
let isSending = false;

function formatDate(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('bg-BG', {
    dateStyle: 'short',
    timeStyle: 'short'
  }).format(new Date(value));
}

function scrollMessagesToBottom() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function autoResizeTextarea() {
  messageInput.style.height = 'auto';
  messageInput.style.height = `${Math.min(messageInput.scrollHeight, 170)}px`;
}

function createMessage(role, content, createdAt) {
  const row = document.createElement('div');
  row.className = `message-row ${role}`;

  const avatar = document.createElement('div');
  avatar.className = 'avatar';
  avatar.textContent = role === 'user' ? 'Ти' : 'AI';

  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.textContent = content;

  if (createdAt) {
    const time = document.createElement('div');
    time.className = 'message-time';
    time.textContent = formatDate(createdAt);
    bubble.appendChild(time);
  }

  row.appendChild(avatar);
  row.appendChild(bubble);
  return row;
}

function createLoadingMessage() {
  const row = document.createElement('div');
  row.className = 'message-row assistant';
  row.id = 'loadingMessage';

  const avatar = document.createElement('div');
  avatar.className = 'avatar';
  avatar.textContent = 'AI';

  const bubble = document.createElement('div');
  bubble.className = 'bubble';

  const loading = document.createElement('div');
  loading.className = 'loading';
  loading.setAttribute('aria-label', 'Зареждане');
  loading.innerHTML = '<span></span><span></span><span></span>';

  bubble.appendChild(loading);
  row.appendChild(avatar);
  row.appendChild(bubble);
  return row;
}

function renderMessages(entries = history) {
  messagesEl.innerHTML = '';

  if (!entries.length) {
    messagesEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">✦</div>
        <h3>Задай въпрос към локалния LLM</h3>
        <p>Отговорите и въпросите се пазят локално в <code>data/chat_history.json</code>.</p>
      </div>
    `;
    return;
  }

  for (const item of entries) {
    messagesEl.appendChild(createMessage('user', item.question, item.createdAt));
    messagesEl.appendChild(createMessage('assistant', item.answer, item.createdAt));
  }

  scrollMessagesToBottom();
}

function renderHistoryList() {
  historyListEl.innerHTML = '';

  if (!history.length) {
    const empty = document.createElement('p');
    empty.className = 'history-date';
    empty.textContent = 'Все още няма запазени въпроси.';
    historyListEl.appendChild(empty);
    return;
  }

  [...history].reverse().forEach((item) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `history-item ${item.id === activeEntryId ? 'active' : ''}`;

    const title = document.createElement('div');
    title.className = 'history-title';
    title.textContent = item.question;

    const date = document.createElement('div');
    date.className = 'history-date';
    date.textContent = `${formatDate(item.createdAt)} · ${item.model || 'model'}`;

    button.appendChild(title);
    button.appendChild(date);

    button.addEventListener('click', () => {
      activeEntryId = item.id;
      renderHistoryList();
      renderMessages([item]);
    });

    historyListEl.appendChild(button);
  });
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = data.details || data.error || 'Unknown error';
    throw new Error(message);
  }

  return data;
}

async function loadConfig() {
  const config = await fetchJson('/api/config');
  modelInput.value = config.defaultModel || 'llama3.2';
}

async function checkHealth() {
  const health = await fetchJson('/api/health');

  if (health.ollama === 'ok') {
    statusText.textContent = `Backend: OK · Ollama: OK · Модел по подразбиране: ${health.model}`;
    statusText.className = 'status-ok';
  } else {
    statusText.textContent = 'Backend: OK · Ollama не е стартиран или няма достъп до него.';
    statusText.className = 'status-bad';
  }
}

async function loadHistory() {
  history = await fetchJson('/api/history');
  activeEntryId = null;
  renderHistoryList();
  renderMessages(history);
}

function setSending(value) {
  isSending = value;
  sendBtn.disabled = value;
  messageInput.disabled = value;
  sendBtn.textContent = value ? 'Мисля...' : 'Изпрати';
}

async function sendMessage(message) {
  setSending(true);

  const optimisticQuestion = createMessage('user', message, new Date().toISOString());
  const loadingMessage = createLoadingMessage();

  const empty = messagesEl.querySelector('.empty-state');
  if (empty) messagesEl.innerHTML = '';

  messagesEl.appendChild(optimisticQuestion);
  messagesEl.appendChild(loadingMessage);
  scrollMessagesToBottom();

  try {
    const entry = await fetchJson('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        model: modelInput.value.trim()
      })
    });

    history.push(entry);
    activeEntryId = null;
    renderHistoryList();
    renderMessages(history);
  } catch (error) {
    loadingMessage.remove();
    messagesEl.appendChild(createMessage('assistant', `Грешка: ${error.message}`, new Date().toISOString()));
    scrollMessagesToBottom();
  } finally {
    setSending(false);
    messageInput.focus();
  }
}

chatForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (isSending) return;

  const message = messageInput.value.trim();
  if (!message) return;

  messageInput.value = '';
  autoResizeTextarea();
  await sendMessage(message);
});

messageInput.addEventListener('input', autoResizeTextarea);

messageInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    chatForm.requestSubmit();
  }
});

newChatBtn.addEventListener('click', async () => {
  const confirmed = confirm('Сигурен ли си, че искаш да изтриеш цялата история?');
  if (!confirmed) return;

  await fetchJson('/api/history', { method: 'DELETE' });
  await loadHistory();
});

(async function init() {
  try {
    await loadConfig();
    await checkHealth();
    await loadHistory();
  } catch (error) {
    statusText.textContent = `Грешка при зареждане: ${error.message}`;
    statusText.className = 'status-bad';
  }
})();