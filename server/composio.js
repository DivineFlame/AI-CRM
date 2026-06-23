const COMPOSIO_API_KEY = process.env.COMPOSIO_API_KEY;
const COMPOSIO_USER_ID = process.env.COMPOSIO_USER_ID || 'local-user';
const GMAIL_AUTH_CONFIG_ID = process.env.COMPOSIO_GMAIL_AUTH_CONFIG_ID;
const GMAIL_CONNECTED_ACCOUNT_ID = process.env.COMPOSIO_GMAIL_CONNECTED_ACCOUNT_ID;
const GMAIL_TOOLKIT_VERSION = process.env.COMPOSIO_GMAIL_TOOLKIT_VERSION || '20260506_01';
const APP_BASE_URL = process.env.APP_BASE_URL;

let composioClient;

async function getComposio() {
  if (!COMPOSIO_API_KEY) return null;
  if (composioClient) return composioClient;
  const { Composio } = await import('@composio/core');
  composioClient = new Composio({ apiKey: COMPOSIO_API_KEY });
  return composioClient;
}

async function executeTool(tool, argumentsPayload = {}) {
  const composio = await getComposio();
  if (!composio) throw new Error('COMPOSIO_API_KEY is not configured');

  if (composio.tools?.execute) {
    return composio.tools.execute(tool, {
      userId: COMPOSIO_USER_ID,
      connectedAccountId: GMAIL_CONNECTED_ACCOUNT_ID || undefined,
      version: GMAIL_TOOLKIT_VERSION,
      arguments: argumentsPayload
    });
  }

  throw new Error('Installed Composio SDK does not expose tools.execute');
}

function pickRedirectUrl(connection) {
  return connection?.redirectUrl || connection?.authUrl || connection?.url || '';
}

function pickConnectionId(connection) {
  return connection?.id || connection?.connectedAccountId || connection?.connected_account_id || '';
}

export async function createGmailConnection(email) {
  const composio = await getComposio();
  if (!composio) {
    return {
      status: 'not_configured',
      authUrl: '',
      message: 'Add COMPOSIO_API_KEY to .env and restart the API server.'
    };
  }

  if (!GMAIL_AUTH_CONFIG_ID) {
    return {
      status: 'auth_config_required',
      authUrl: 'https://dashboard.composio.dev/auth-configs',
      message: 'Create a Gmail auth config in Composio and set COMPOSIO_GMAIL_AUTH_CONFIG_ID.'
    };
  }

  try {
    if (composio.connectedAccounts?.link) {
      const connection = await composio.connectedAccounts.link(COMPOSIO_USER_ID, GMAIL_AUTH_CONFIG_ID, {
        callbackUrl: APP_BASE_URL ? `${APP_BASE_URL}/api/gmail/callback` : undefined
      });
      return {
        status: 'pending_auth',
        authUrl: pickRedirectUrl(connection),
        connectedAccountId: pickConnectionId(connection),
        message: `Open the Composio authorization URL and connect ${email}.`
      };
    }

    if (composio.connectedAccounts?.initiate) {
      const connection = await composio.connectedAccounts.initiate(COMPOSIO_USER_ID, GMAIL_AUTH_CONFIG_ID);
      return {
        status: 'pending_auth',
        authUrl: pickRedirectUrl(connection),
        connectedAccountId: pickConnectionId(connection),
        message: `Open the Composio authorization URL and connect ${email}.`
      };
    }
  } catch (error) {
    return {
      status: 'error',
      authUrl: '',
      message: error.message
    };
  }

  return {
    status: 'sdk_method_missing',
    authUrl: 'https://dashboard.composio.dev',
    message: 'The installed Composio SDK did not expose link/initiate connected account methods.'
  };
}

export async function getGmailConfigurationStatus() {
  const composio = await getComposio();
  if (!composio) {
    return {
      configured: false,
      apiKey: false,
      authConfigId: Boolean(GMAIL_AUTH_CONFIG_ID),
      connectedAccountId: Boolean(GMAIL_CONNECTED_ACCOUNT_ID),
      accounts: [],
      message: 'COMPOSIO_API_KEY is not configured.'
    };
  }

  let accounts = [];
  let authConfigs = [];
  try {
    const [accountResult, configResult] = await Promise.all([
      composio.connectedAccounts?.list?.({ userId: COMPOSIO_USER_ID }).catch((error) => ({ error: error.message })),
      composio.authConfigs?.list?.({ toolkit: 'gmail' }).catch((error) => ({ error: error.message }))
    ]);
    accounts = normalizeList(accountResult).filter((account) =>
      String(account.toolkit?.slug || account.toolkit || account.appName || '').toLowerCase().includes('gmail')
    );
    authConfigs = normalizeList(configResult);
    return {
      configured: Boolean(GMAIL_AUTH_CONFIG_ID) && accounts.some((account) => ['ACTIVE', 'active'].includes(account.status)),
      apiKey: true,
      authConfigId: Boolean(GMAIL_AUTH_CONFIG_ID),
      connectedAccountId: Boolean(GMAIL_CONNECTED_ACCOUNT_ID),
      authConfigs: authConfigs.map((config) => ({
        id: config.id || config.nanoid,
        name: config.name,
        toolkit: config.toolkit?.slug || config.toolkit,
        type: config.type,
        isComposioManaged: config.isComposioManaged
      })),
      accounts: accounts.map((account) => ({
        id: account.id || account.nanoid,
        status: account.status,
        toolkit: account.toolkit?.slug || account.toolkit,
        email: account.data?.email || account.email || account.accountName || ''
      })),
      message: 'Composio API call completed.'
    };
  } catch (error) {
    return {
      configured: false,
      apiKey: true,
      authConfigId: Boolean(GMAIL_AUTH_CONFIG_ID),
      connectedAccountId: Boolean(GMAIL_CONNECTED_ACCOUNT_ID),
      accounts,
      authConfigs,
      message: error.message
    };
  }
}

export async function fetchRecentEmails() {
  try {
    const result = await executeTool('GMAIL_FETCH_EMAILS', {
      max_results: 10,
      query: 'newer_than:30d'
    });
    const emails = result?.data?.messages || result?.messages || result?.data || [];
    return Array.isArray(emails) ? emails.map(normalizeEmail) : [];
  } catch {
    return demoEmails();
  }
}

export async function createDraft(to, subject, body, threadId) {
  try {
    return executeTool('GMAIL_CREATE_EMAIL_DRAFT', {
      recipient_email: to,
      subject,
      body,
      thread_id: threadId
    });
  } catch (error) {
    return { mocked: true, id: `draft_${Date.now()}`, error: error.message };
  }
}

export async function sendDraft(draftId) {
  return executeTool('GMAIL_SEND_DRAFT', { draft_id: draftId });
}

function normalizeList(result) {
  if (Array.isArray(result)) return result;
  if (Array.isArray(result?.items)) return result.items;
  if (Array.isArray(result?.data?.items)) return result.data.items;
  if (Array.isArray(result?.data)) return result.data;
  return [];
}

function normalizeEmail(email) {
  return {
    id: email.id || email.messageId || `mail_${Date.now()}`,
    threadId: email.threadId || email.thread_id || '',
    from: email.from || email.sender || email.from_email || 'unknown@example.com',
    fromName: email.fromName || email.sender_name || '',
    subject: email.subject || '(no subject)',
    body: email.body || email.snippet || email.text || '',
    receivedAt: email.date || email.receivedAt || new Date().toISOString()
  };
}

function demoEmails() {
  return [
    {
      id: 'demo_1',
      threadId: 'thread_demo_1',
      from: 'maya@northstarops.com',
      fromName: 'Maya Singh',
      subject: 'Looking for CRM automation for our sales inbox',
      body: 'We are evaluating tools that can read inbound product enquiries, qualify leads, and draft replies for approval. Can you share how your system works?',
      receivedAt: new Date().toISOString()
    },
    {
      id: 'demo_2',
      threadId: 'thread_demo_2',
      from: 'arjun@bluepeakretail.com',
      fromName: 'Arjun Mehta',
      subject: 'Need follow-up automation',
      body: 'Our team misses follow-ups from Gmail. We need lead scoring and suggested responses, but nothing should send without manager approval.',
      receivedAt: new Date(Date.now() - 86400000).toISOString()
    }
  ];
}
