const HERMES_BASE_URL = (process.env.HERMES_BASE_URL || 'http://127.0.0.1:8642').replace(/\/+$/, '');
const HERMES_API_KEY = process.env.HERMES_API_KEY || '';
const HERMES_MODEL = process.env.HERMES_MODEL || 'hermes-agent';
const HERMES_TIMEOUT_MS = Math.max(Number(process.env.HERMES_TIMEOUT_MS || 120000), 5000);

export async function getHermesStatus() {
  if (!HERMES_API_KEY) {
    return {
      online: false,
      configured: false,
      model: HERMES_MODEL,
      error: 'HERMES_API_KEY is required'
    };
  }

  try {
    const health = await hermesRequest('/health', { authenticated: false });
    return {
      online: health.status === 'ok',
      configured: true,
      platform: health.platform || 'hermes-agent',
      version: health.version || '',
      model: HERMES_MODEL
    };
  } catch (error) {
    return {
      online: false,
      configured: true,
      model: HERMES_MODEL,
      error: error.message
    };
  }
}

export async function runHermesAgent(input, { sessionKey, idempotencyKey } = {}) {
  if (!HERMES_API_KEY) {
    throw new Error('Hermes is not configured. Set HERMES_API_KEY.');
  }

  const response = await hermesRequest('/v1/responses', {
    method: 'POST',
    headers: {
      ...(sessionKey ? { 'X-Hermes-Session-Key': sessionKey } : {}),
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {})
    },
    body: {
      model: HERMES_MODEL,
      input,
      instructions: 'Complete the CRM task exactly as requested. Return only the final requested content without markdown fences.',
      store: false
    }
  });

  if (response.status && response.status !== 'completed') {
    throw new Error(`Hermes response ended with status ${response.status}`);
  }

  const text = extractHermesText(response);
  if (!text) throw new Error('Hermes returned no assistant output');
  return text;
}

function extractHermesText(response) {
  const parts = [];
  for (const item of response.output || []) {
    if (item.type !== 'message' || item.role !== 'assistant') continue;
    for (const content of item.content || []) {
      if (content.type === 'output_text' && content.text) parts.push(content.text);
    }
  }
  return parts.join('\n').trim();
}

async function hermesRequest(path, { method = 'GET', body, headers = {}, authenticated = true } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HERMES_TIMEOUT_MS);
  try {
    const response = await fetch(`${HERMES_BASE_URL}${path}`, {
      method,
      headers: {
        Accept: 'application/json',
        ...(authenticated ? { Authorization: `Bearer ${HERMES_API_KEY}` } : {}),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...headers
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal
    });
    const text = await response.text();
    const data = text ? safeJson(text) : {};
    if (!response.ok) {
      const detail = data.error?.message || data.error || data.message;
      throw new Error(detail || `Hermes returned ${response.status}`);
    }
    return data;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error(`Hermes request timed out after ${HERMES_TIMEOUT_MS}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function safeJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return { message: value };
  }
}
