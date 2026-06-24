# AI CRM

AI CRM for Gmail communication, local Ollama drafting, Composio Gmail actions, and company-profile based lead generation.

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
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=llama3.1
HOST=0.0.0.0
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
- Environment variables: set `COMPOSIO_API_KEY`, `COMPOSIO_USER_ID`, `COMPOSIO_GMAIL_AUTH_CONFIG_ID`, `APP_BASE_URL`, `PUBLIC_BASE_URL`, `OLLAMA_BASE_URL`, `OLLAMA_MODEL`

The Node server serves both the API and the built React app in production.

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

All AI generation uses local Ollama through `OLLAMA_BASE_URL`; when Ollama is unavailable, deterministic fallback responses keep the app usable.

AI-generated leads, campaigns, email replies, intro emails, and drafts use the saved company profile, products, and gathered website intelligence as the exclusive source for company claims and positioning. Recipient emails, lead records, web candidates, templates, and goals are used only for recipient context, selection, structure, and tone. AI generation is blocked until the company profile and website intelligence are complete.

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
curl https://your-domain.example.com/api/composio/gmail/status
npm run check:composio
```

## Production commands

```bash
npm ci
npm run build
npm start
```
