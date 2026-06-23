import 'dotenv/config';
import 'express-async-errors';
import express from 'express';
import cors from 'cors';
import compression from 'compression';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  analyzeEmailForLead,
  draftEmailReply,
  generateCampaignDraft,
  generateLeadBrief,
  generateNextBestAction,
  getOllamaStatus
} from './ollama.js';
import {
  createDraft,
  createGmailConnection,
  fetchRecentEmails,
  getGmailConfigurationStatus,
  sendDraft
} from './composio.js';
import { createId, loadState, updateState } from './store.js';

const app = express();
const port = process.env.PORT || 4000;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(__dirname, '../dist');

app.set('trust proxy', 1);
app.use(helmet({
  contentSecurityPolicy: false
}));
app.use(compression());
app.use(cors());
app.use(rateLimit({
  windowMs: 60 * 1000,
  limit: 180,
  standardHeaders: true,
  legacyHeaders: false
}));
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', async (req, res) => {
  const ollama = await getOllamaStatus();
  res.json({
    ok: true,
    service: 'ai-crm',
    composioConfigured: Boolean(process.env.COMPOSIO_API_KEY),
    ollama
  });
});

app.get('/api/state', async (req, res) => {
  const [state, ollama, composio] = await Promise.all([
    loadState(),
    getOllamaStatus(),
    getGmailConfigurationStatus()
  ]);
  res.json({
    ...state,
    system: {
      ollama,
      composioConfigured: composio.configured,
      composio
    }
  });
});

app.get('/api/composio/gmail/status', async (req, res) => {
  res.json(await getGmailConfigurationStatus());
});

app.put('/api/company', async (req, res) => {
  const state = await updateState((current) => ({
    ...current,
    company: { ...current.company, ...req.body }
  }));
  res.json(state.company);
});

app.post('/api/products', async (req, res) => {
  const product = { id: createId('prod'), ...req.body };
  await updateState((state) => ({ ...state, products: [product, ...state.products] }));
  res.status(201).json(product);
});

app.delete('/api/products/:id', async (req, res) => {
  await updateState((state) => ({
    ...state,
    products: state.products.filter((product) => product.id !== req.params.id)
  }));
  res.status(204).end();
});

app.post('/api/gmail/connect', async (req, res) => {
  const email = req.body.email?.trim();
  if (!email) return res.status(400).json({ error: 'Gmail address is required' });

  const connection = await createGmailConnection(email);
  await updateState((state) => ({
    ...state,
    gmail: {
      ...state.gmail,
      email,
      connectionStatus: connection.status,
      connectedAccountId: connection.connectedAccountId || state.gmail.connectedAccountId || '',
      authUrl: connection.authUrl || '',
      message: connection.message
    }
  }));
  res.json(connection);
});

app.get('/api/gmail/callback', async (req, res) => {
  await updateState((state) => ({
    ...state,
    gmail: {
      ...state.gmail,
      connectionStatus: 'callback_received',
      message: 'Composio returned from Gmail authorization. Use Check Status to confirm the account is active.'
    }
  }));
  res.redirect('/');
});

app.post('/api/email/sync', async (req, res) => {
  const emails = await fetchRecentEmails();
  const state = await updateState((current) => ({
    ...current,
    emails,
    gmail: { ...current.gmail, lastSync: new Date().toISOString() }
  }));
  res.json({ emails: state.emails, gmail: state.gmail });
});

app.post('/api/email/analyze', async (req, res) => {
  const current = await loadState();
  const selectedEmails = req.body.emailIds?.length
    ? current.emails.filter((email) => req.body.emailIds.includes(email.id))
    : current.emails;

  const created = [];
  for (const email of selectedEmails) {
    const leadData = await analyzeEmailForLead(email, current.company, current.products);
    const lead = {
      id: createId('lead'),
      sourceEmailId: email.id,
      createdAt: new Date().toISOString(),
      ...leadData
    };
    const body = await draftEmailReply(email, lead, current.company);
    const approval = {
      id: createId('approval'),
      emailId: email.id,
      leadId: lead.id,
      to: lead.email || email.from,
      subject: `Re: ${email.subject}`,
      body,
      status: 'pending',
      draftProviderId: '',
      createdAt: new Date().toISOString()
    };
    created.push({ lead, approval });
  }

  await updateState((state) => ({
    ...state,
    leads: [...created.map((item) => item.lead), ...state.leads],
    approvals: [...created.map((item) => item.approval), ...state.approvals]
  }));

  res.status(201).json(created);
});

app.post('/api/ai/brief', async (req, res) => {
  const state = await loadState();
  res.json(await generateLeadBrief(state.leads, state.approvals, state.company));
});

app.post('/api/ai/campaign', async (req, res) => {
  const state = await loadState();
  res.json(await generateCampaignDraft(state.company, state.products, state.leads));
});

app.post('/api/leads/:id/next-action', async (req, res) => {
  const state = await loadState();
  const lead = state.leads.find((item) => item.id === req.params.id);
  if (!lead) return res.status(404).json({ error: 'Lead not found' });
  res.json(await generateNextBestAction(lead, state.company, state.products));
});

app.patch('/api/approvals/:id', async (req, res) => {
  const next = await updateState((state) => ({
    ...state,
    approvals: state.approvals.map((approval) =>
      approval.id === req.params.id ? { ...approval, ...req.body, updatedAt: new Date().toISOString() } : approval
    )
  }));
  res.json(next.approvals.find((approval) => approval.id === req.params.id));
});

app.post('/api/approvals/:id/create-draft', async (req, res) => {
  const state = await loadState();
  const approval = state.approvals.find((item) => item.id === req.params.id);
  if (!approval) return res.status(404).json({ error: 'Approval not found' });
  const email = state.emails.find((item) => item.id === approval.emailId);
  const draft = await createDraft(approval.to, approval.subject, approval.body, email?.threadId);

  await updateState((current) => ({
    ...current,
    approvals: current.approvals.map((item) =>
      item.id === approval.id
        ? { ...item, draftProviderId: draft.id || draft.draft_id || 'local-draft', status: 'drafted' }
        : item
    )
  }));
  res.json(draft);
});

app.post('/api/approvals/:id/send', async (req, res) => {
  const state = await loadState();
  const approval = state.approvals.find((item) => item.id === req.params.id);
  if (!approval) return res.status(404).json({ error: 'Approval not found' });
  if (!approval.draftProviderId) return res.status(400).json({ error: 'Create a Gmail draft before sending' });

  const result = await sendDraft(approval.draftProviderId);
  await updateState((current) => ({
    ...current,
    approvals: current.approvals.map((item) =>
      item.id === approval.id ? { ...item, status: 'sent', sentAt: new Date().toISOString() } : item
    ),
    leads: current.leads.map((lead) =>
      lead.id === approval.leadId ? { ...lead, stage: lead.stage === 'New' ? 'Qualified' : lead.stage } : lead
    )
  }));
  res.json(result);
});

app.use('/api', (req, res) => {
  res.status(404).json({ error: 'API route not found' });
});

app.use(express.static(clientDist));

app.get('*', (req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

app.use((error, req, res, next) => {
  console.error(error);
  res.status(error.status || 500).json({
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message
  });
});

app.listen(port, () => {
  console.log(`AI CRM API listening on http://127.0.0.1:${port}`);
});
