# LlamaChat

A minimal local AI chat app powered by Ollama.

## First commit version

This version is intentionally simple but functional:

- Web UI for asking questions
- Express backend
- Ollama API connection
- `.env` configuration
- No persistent history yet

## Requirements

- Node.js 18+
- Ollama installed and running
- A local Ollama model, for example:

```bash
ollama run llama3.2:3b
```

## Run

```bash
npm install
cp .env.example .env
npm run dev
```

Open:

```text
http://localhost:3000
```


