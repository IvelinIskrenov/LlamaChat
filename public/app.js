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

/**
 * Summary:
 * Formats a date value into Bulgarian short date and time format.
 * Used to display timestamps for chat messages and history items.
 */
function formatDate(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('bg-BG', {
    dateStyle: 'short',
    timeStyle: 'short'
  }).format(new Date(value));
}

/**
 * Summary:
 * Scrolls the messages container to the bottom.
 * Used after rendering or adding messages so the latest message is visible.
 */
function scrollMessagesToBottom() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

/**
 * Summary:
 * Automatically resizes the textarea based on the typed content.
 * This makes the input field more comfortable for longer messages.
 */
function autoResizeTextarea() {
  messageInput.style.height = 'auto';
  messageInput.style.height = `${Math.min(messageInput.scrollHeight, 170)}px`;
}

/**
 * Summary:
 * Creates a single chat message element.
 * It supports both user messages and assistant messages, including an optional timestamp.
 */
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

/**
 * Summary:
 * Creates a temporary loading message while the assistant is generating a response.
 * It displays animated dots inside an assistant message bubble.
 */
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
  loading.setAttribute('aria-label', 'loading');
  loading.innerHTML = '<span></span><span></span><span></span>';

  bubble.appendChild(loading);
  row.appendChild(avatar);
  row.appendChild(bubble);
  return row;
}

/**
 * Summary:
 * Renders chat messages in the main chat area.
 * If there are no messages, it shows an empty state with basic project information.
 */
function renderMessages(entries = history) {
  messagesEl.innerHTML = '';

  if (!entries.length) {
    messagesEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">✦</div>
        <h3>Ask question our LLM</h3>
        <p>Q&A are saved localy in<code>data/chat_history.json</code>.</p>
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

/**
 * Summary:
 * Renders the saved chat history in the sidebar.
 * Each history item can be clicked to display only that specific question and answer.
 */
function renderHistoryList() {
  historyListEl.innerHTML = '';

  if (!history.length) {
    const empty = document.createElement('p');
    empty.className = 'history-date';
    empty.textContent = 'There are no Q&As';
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

/**
 * Summary:
 * Sends an HTTP request and safely parses the JSON response.
 * If the server returns an error status, it throws a readable error message.
 */
async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = data.details || data.error || 'Unknown error';
    throw new Error(message);
  }

  return data;
}

/**
 * Summary:
 * Loads the default app configuration from the backend.
 * It sets the default Ollama model inside the model input field.
 */
async function loadConfig() {
  const config = await fetchJson('/api/config');
  modelInput.value = config.defaultModel || 'llama3.2';
}

/**
 * Summary:
 * Checks whether the backend and Ollama service are available.
 * It updates the status text in the UI depending on the health check result.
 */
async function checkHealth() {
  const health = await fetchJson('/api/health');

  if (health.ollama === 'ok') {
    statusText.textContent = `Backend: OK · Ollama: OK · Model: ${health.model}`;
    statusText.className = 'status-ok';
  } else {
    statusText.textContent = 'Backend: OK · Ollama not started yet.';
    statusText.className = 'status-bad';
  }
}

/**
 * Summary:
 * Loads the saved chat history from the backend.
 * After loading, it refreshes both the sidebar history list and the main chat area.
 */
async function loadHistory() {
  history = await fetchJson('/api/history');
  activeEntryId = null;
  renderHistoryList();
  renderMessages(history);
}

/**
 * Summary:
 * Enables or disables the message input and send button while a request is running.
 * This prevents multiple messages from being sent at the same time.
 */
function setSending(value) {
  isSending = value;
  sendBtn.disabled = value;
  messageInput.disabled = value;
  sendBtn.textContent = value ? 'Thinking...' : 'Send';
}

/**
 * Summary:
 * Sends the user's message to the backend chat API.
 * It shows the user message immediately, displays a loading state, saves the AI response, and updates the history.
 */
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
    messagesEl.appendChild(createMessage('assistant', `Error: ${error.message}`, new Date().toISOString()));
    scrollMessagesToBottom();
  } finally {
    setSending(false);
    messageInput.focus();
  }
}

/**
 * Summary:
 * Handles the chat form submit event.
 * It prevents page reload, validates the message, clears the input, and sends the message.
 */
chatForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (isSending) return;

  const message = messageInput.value.trim();
  if (!message) return;

  messageInput.value = '';
  autoResizeTextarea();
  await sendMessage(message);
});

/**
 * Summary:
 * Resizes the textarea whenever the user types inside it.
 */
messageInput.addEventListener('input', autoResizeTextarea);

/**
 * Summary:
 * Sends the message when Enter is pressed.
 * Shift + Enter still creates a new line inside the textarea.
 */
messageInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    chatForm.requestSubmit();
  }
});

/**
 * Summary:
 * Handles the clear history button.
 * It asks for confirmation, deletes the saved history, and reloads the empty chat state.
 */
newChatBtn.addEventListener('click', async () => {
  const confirmed = confirm('Are you sure?');
  if (!confirmed) return;

  await fetchJson('/api/history', { method: 'DELETE' });
  await loadHistory();
});

/**
 * Summary:
 * Initializes the application when the page loads.
 * It loads configuration, checks backend/Ollama health, and loads saved chat history.
 */
(async function init() {
  try {
    await loadConfig();
    await checkHealth();
    await loadHistory();
  } catch (error) {
    statusText.textContent = `Loading error: ${error.message}`;
    statusText.className = 'status-bad';
  }
})();