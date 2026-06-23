const COMPOSIO_API_KEY = process.env.COMPOSIO_API_KEY;
const COMPOSIO_USER_ID = process.env.COMPOSIO_USER_ID || 'local-user';

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
    return composio.tools.execute(COMPOSIO_USER_ID, tool, { arguments: argumentsPayload });
  }

  throw new Error('Installed Composio SDK does not expose tools.execute');
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

  try {
    if (composio.connectedAccounts?.initiate) {
      const connection = await composio.connectedAccounts.initiate(COMPOSIO_USER_ID, 'GMAIL');
      return {
        status: 'pending_auth',
        authUrl: connection.redirectUrl || connection.authUrl || '',
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
    status: 'manual',
    authUrl: 'https://dashboard.composio.dev',
    message: 'Open Composio dashboard and connect the Gmail toolkit for this user.'
  };
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
