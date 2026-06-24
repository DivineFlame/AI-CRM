# AI CRM

AI CRM for Gmail communication, direct Hermes Agent integration, Composio Gmail actions, and company-profile based lead generation.

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
HERMES_BASE_URL=http://127.0.0.1:8642
HERMES_API_KEY=your_hermes_api_server_key
HERMES_MODEL=hermes-agent
HERMES_TIMEOUT_MS=120000
HOST=0.0.0.0
PORT=4000
```

The CRM connects directly to Hermes Agent and requires no additional AI orchestration layer.

For Docker/Dokploy, when Hermes runs on the same host at its default port, use:

```env
HERMES_BASE_URL=http://host.docker.internal:8642
```

## Dokploy deployment

Use either Dockerfile or Docker Compose deployment in Dokploy.

Recommended Dokploy settings:

- Build type: Docker Compose
- Compose file: `docker-compose.yml`
- Internal app port: `4000` (configure this as the Dokploy domain/service port)
- Health check path: `/api/health`
- Environment variables: set the Composio values plus `HERMES_BASE_URL`, `HERMES_API_KEY`, `HERMES_MODEL`, and `HERMES_TIMEOUT_MS`

The Node server serves both the API and the built React app in production.
The Compose service uses `expose` instead of publishing host port `4000`, allowing Dokploy to route through its proxy without colliding with older deployments.

## Hermes Agent setup

1. Deploy Hermes Agent separately.
2. Enable its API server with `API_SERVER_ENABLED=true`, bind it to a reachable interface with `API_SERVER_HOST=0.0.0.0`, and set a strong `API_SERVER_KEY`.
3. Set the same URL and key as `HERMES_BASE_URL` and `HERMES_API_KEY` in the CRM. Hermes uses port `8642` by default.
4. Configure the desired inference provider and model inside Hermes. The CRM talks to the Hermes agent API, not to the underlying model provider.

For every AI operation, the CRM sends the company-profile-based prompt directly to Hermes `/v1/responses`. Hermes provides the agent runtime, tools, memory, and model-provider connection.

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

All AI generation is executed directly by the separately deployed Hermes agent. Requests fail visibly if Hermes is unavailable or misconfigured.

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
curl https://your-domain.example.com/api/hermes/status
curl https://your-domain.example.com/api/composio/gmail/status
npm run check:composio
```

## Production commands

```bash
npm ci
npm run build
npm start
```
