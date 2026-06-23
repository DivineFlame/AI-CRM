# AI CRM

Approval-first CRM for Gmail communication, local Ollama drafting, Composio Gmail actions, and lead generation.

## Local setup

```bash
npm install
cp .env.example .env
npm run dev
```

Open `http://127.0.0.1:5173`.

## Environment

```env
COMPOSIO_API_KEY=your_composio_key
COMPOSIO_USER_ID=owner@example.com
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=llama3.1
PORT=4000
```

For Docker/Dokploy, if Ollama runs on the host machine, use:

```env
OLLAMA_BASE_URL=http://host.docker.internal:11434
```

## Dokploy deployment

Use either Dockerfile or Docker Compose deployment in Dokploy.

Recommended Dokploy settings:

- Build type: Docker Compose
- Compose file: `docker-compose.yml`
- Exposed app port: `4000`
- Health check path: `/api/health`
- Environment variables: set `COMPOSIO_API_KEY`, `COMPOSIO_USER_ID`, `OLLAMA_BASE_URL`, `OLLAMA_MODEL`

The Node server serves both the API and the built React app in production.

## Production commands

```bash
npm ci
npm run build
npm start
```
