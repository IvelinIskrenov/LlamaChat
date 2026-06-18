require('dotenv').config();

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const OLLAMA_BASE_URL = (process.env.OLLAMA_BASE_URL || 'http://localhost:11434/api').replace(/\/$/, '');
const DEFAULT_MODEL = process.env.OLLAMA_MODEL || 'llama3.2';
const CONTEXT_PAIRS = Number(process.env.CONTEXT_PAIRS || 8);
const SYSTEM_PROMPT = process.env.SYSTEM_PROMPT || 'You are a helpful assistant. Answer clearly and concisely in the user\'s language.';

const DATA_DIR = path.join(__dirname, 'data');
const HISTORY_FILE = path.join(DATA_DIR, 'chat_history.json');

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

/**
 * Summary:
 * Ensures that the data directory and chat history file exist.
 * If they do not exist, the function creates them automatically.
 */
function ensureHistoryFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(HISTORY_FILE)) {
    fs.writeFileSync(HISTORY_FILE, '[]', 'utf8');
  }
}

/**
 * Summary:
 * Reads the saved chat history from the local JSON file.
 * If the file is missing, invalid, or unreadable, it safely returns an empty array.
 */
function readHistory() {
  ensureHistoryFile();

  try {
    const raw = fs.readFileSync(HISTORY_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error('Could not read chat history:', error.message);
    return [];
  }
}

/**
 * Summary:
 * Writes the current chat history into the local JSON file.
 * The history is stored in a readable formatted JSON structure.
 */
function writeHistory(history) {
  ensureHistoryFile();
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2), 'utf8');
}

/**
 * Summary:
 * Builds the message context that will be sent to Ollama.
 * It includes the system prompt, recent chat history, and the new user question.
 */
function buildMessages(history, newQuestion) {
  const recentHistory = history.slice(-CONTEXT_PAIRS);
  const messages = [{ role: 'system', content: SYSTEM_PROMPT }];

  for (const item of recentHistory) {
    messages.push({ role: 'user', content: item.question });
    messages.push({ role: 'assistant', content: item.answer });
  }

  messages.push({ role: 'user', content: newQuestion });
  return messages;
}

/**
 * Summary:
 * Sends a fetch request with a timeout limit.
 * If the request takes too long, it is automatically aborted.
 */
async function fetchWithTimeout(url, options = {}, timeoutMs = 120000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Summary:
 * Returns the frontend configuration values.
 * This allows the client to know the default model, Ollama URL, and context size.
 */
app.get('/api/config', (_req, res) => {
  res.json({
    defaultModel: DEFAULT_MODEL,
    ollamaBaseUrl: OLLAMA_BASE_URL,
    contextPairs: CONTEXT_PAIRS
  });
});

/**
 * Summary:
 * Checks whether the backend is running and whether Ollama is reachable.
 * It is used by the frontend to show the current app and Ollama connection status.
 */
app.get('/api/health', async (_req, res) => {
  try {
    const response = await fetchWithTimeout(`${OLLAMA_BASE_URL}/tags`, {}, 2500);
    res.json({
      backend: 'ok',
      ollama: response.ok ? 'ok' : 'not-ready',
      model: DEFAULT_MODEL
    });
  } catch (error) {
    res.json({
      backend: 'ok',
      ollama: 'offline',
      model: DEFAULT_MODEL,
      message: 'Ollama is not reachable. Start Ollama and pull a model first.'
    });
  }
});

/**
 * Summary:
 * Returns all saved chat history entries.
 * The frontend uses this endpoint to render the sidebar and previous conversations.
 */
app.get('/api/history', (_req, res) => {
  res.json(readHistory());
});

/**
 * Summary:
 * Deletes all saved chat history.
 * It resets the local history file to an empty array.
 */
app.delete('/api/history', (_req, res) => {
  writeHistory([]);
  res.json({ ok: true });
});

/**
 * Summary:
 * Receives a user message, sends it to Ollama, and returns the AI response.
 * The new question and answer are also saved into the local chat history file.
 */
app.post('/api/chat', async (req, res) => {
  const message = String(req.body?.message || '').trim();
  const model = String(req.body?.model || DEFAULT_MODEL).trim() || DEFAULT_MODEL;

  if (!message) {
    return res.status(400).json({ error: 'Message is required.' });
  }

  const history = readHistory();
  const messages = buildMessages(history, message);

  try {
    const response = await fetchWithTimeout(`${OLLAMA_BASE_URL}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages,
        stream: false
      })
    });

    if (!response.ok) {
      const details = await response.text();
      return res.status(502).json({
        error: 'Ollama request failed.',
        details
      });
    }

    const data = await response.json();
    const answer = data?.message?.content || 'No answer returned from Ollama.';

    const entry = {
      id: randomUUID(),
      question: message,
      answer,
      model,
      createdAt: new Date().toISOString()
    };

    history.push(entry);
    writeHistory(history);

    res.json(entry);
  } catch (error) {
    const isAbort = error.name === 'AbortError';
    res.status(503).json({
      error: isAbort ? 'Ollama request timed out.' : 'Cannot connect to Ollama.',
      details: error.message
    });
  }
});

/**
 * Summary:
 * Handles all unknown routes by returning the main frontend HTML file.
 * This keeps the app working even if the user refreshes the page from another route.
 */
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

/**
 * Summary:
 * Starts the Express server on the configured port.
 * It also ensures the chat history file exists before the app begins handling requests.
 */
app.listen(PORT, () => {
  ensureHistoryFile();
  console.log(`Minimal Ollama Chat is running: http://localhost:${PORT}`);
  console.log(`Ollama API: ${OLLAMA_BASE_URL}`);
  console.log(`Default model: ${DEFAULT_MODEL}`);
});