# AI CRM

AI CRM for Gmail communication, Paperclip-managed AI agents, Composio Gmail actions, and company-profile based lead generation.

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
COMPOSIO_GMAIL_AUTH_CONFIG_ID=ac_your_gmail_auth_config
COMPOSIO_GMAIL_CONNECTED_ACCOUNT_ID=
COMPOSIO_GMAIL_TOOLKIT_VERSION=20260506_01
APP_BASE_URL=http://38.247.188.228
PUBLIC_BASE_URL=http://38.247.188.228
PAPERCLIP_BASE_URL=http://127.0.0.1:3100
PAPERCLIP_COMPANY_ID=your_paperclip_company_id
PAPERCLIP_AGENT_ID=your_paperclip_agent_id
PAPERCLIP_API_KEY=your_paperclip_bearer_key
PAPERCLIP_TIMEOUT_MS=120000
PAPERCLIP_POLL_INTERVAL_MS=1500
HOST=0.0.0.0
PORT=4000
```

Paperclip must be deployed separately and configured to use Ollama. The CRM does not connect to Ollama or store an Ollama model name.

For Docker/Dokploy, if Paperclip is reachable on the Docker host, use:

```env
PAPERCLIP_BASE_URL=http://host.docker.internal:3100
```

## Dokploy deployment

Use either Dockerfile or Docker Compose deployment in Dokploy.

Recommended Dokploy settings:

- Build type: Docker Compose
- Compose file: `docker-compose.yml`
- Exposed app port: `4000`
- Health check path: `/api/health`
- Environment variables: set `COMPOSIO_API_KEY`, `COMPOSIO_USER_ID`, `COMPOSIO_GMAIL_AUTH_CONFIG_ID`, `APP_BASE_URL`, `PUBLIC_BASE_URL`, `PAPERCLIP_BASE_URL`, `PAPERCLIP_COMPANY_ID`, `PAPERCLIP_AGENT_ID`, and `PAPERCLIP_API_KEY`

The Node server serves both the API and the built React app in production.

## Paperclip agent setup

1. Deploy Paperclip separately and connect the selected Paperclip agent runtime to Ollama.
2. Create a Paperclip company and a dedicated CRM agent.
3. Give the agent instructions to complete assigned issues, post the requested `AI_CRM_RESULT:` comment, and mark each issue done. The CRM also includes these instructions in every task.
4. Create a long-lived API key for that agent from `POST /api/agents/{agentId}/keys`.
5. Set the Paperclip base URL, company ID, agent ID, and bearer key in the CRM deployment.
6. Ensure the CRM container can reach Paperclip over a private Docker network, host gateway, LAN, or HTTPS endpoint.

For each AI operation, the CRM creates an issue assigned to the configured Paperclip agent, invokes its heartbeat, and polls the issue comments for the structured result. Paperclip owns the Ollama connection, model selection, execution logs, and agent lifecycle.

## Composio Gmail setup

1. In Composio, create or select a Gmail auth config.
2. Copy the auth config ID, usually beginning with `ac_`.
3. Set `COMPOSIO_GMAIL_AUTH_CONFIG_ID` in Dokploy.
4. Set `APP_BASE_URL` to your deployed app URL, for example `http://38.247.188.228`, so the Gmail authorization callback returns to `/api/gmail/callback`.
5. Open the app, enter the Gmail address, and click `Connect`.
6. After OAuth, use `Check` in the Gmail panel or call:

```bash
curl https://your-domain.example.com/api/composio/gmail/status
```

For Composio-managed OAuth, the app uses `connectedAccounts.link(userId, authConfigId)`, which is the current hosted auth flow. Custom auth configs can still be used with the same auth config ID.

## AI features

- Gmail email analysis into leads
- Lead scoring and qualification stage suggestions
- Human-approved AI email reply drafts
- AI sales brief for current leads and approvals
- AI campaign draft from company profile, products, and leads
- Per-lead next-best-action generation
- AI marketing email drafts using approved email templates
- Selected-list campaign queue with a configurable delay between each email

All AI generation goes through the separately deployed Paperclip agent. AI requests fail visibly if Paperclip is unavailable, misconfigured, or does not return a structured result before `PAPERCLIP_TIMEOUT_MS`.

## Marketing campaign queue

1. Add approved templates in `Email Templates`.
2. Select warm leads in `Selected-List Marketing`.
3. Let the AI agent draft the marketing email from the selected template and audience.
4. Review or edit the generated subject/body.
5. Queue the selected list with a delay such as `60` seconds.
6. Run the queue to send one email at a time through Gmail.

The queue never marks emails as sent unless Composio/Gmail returns successfully. If Composio is not configured, queued sends fail visibly instead of pretending delivery.

## Production verification

```bash
curl https://your-domain.example.com/api/health
curl https://your-domain.example.com/api/paperclip/status
curl https://your-domain.example.com/api/composio/gmail/status
npm run check:composio
```

## Production commands

```bash
npm ci
npm run build
npm start
```
