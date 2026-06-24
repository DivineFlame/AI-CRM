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
  generateBuyerIntroEmail,
  generateBuyerLeads,
  generateLeadBrief,
  generateMarketingEmailDraft,
  generateNextBestAction,
  checkoutPaperclipIssue,
  completePaperclipIssue,
  getPaperclipIssue,
  getPaperclipStatus,
  summarizeWebsiteForEmail
} from './paperclip.js';
import { getHermesStatus, runHermesAgent } from './hermes.js';
import {
  createGmailConnection,
  fetchRecentEmails,
  getGmailConfigurationStatus,
  sendEmail
} from './composio.js';
import { createId, loadState, updateState } from './store.js';
import { gatherWebsiteData, searchBuyerCompanies } from './website.js';

const app = express();
const port = process.env.PORT || 4000;
const host = process.env.HOST || '0.0.0.0';
const publicBaseUrl = process.env.APP_BASE_URL || process.env.PUBLIC_BASE_URL || `http://localhost:${port}`;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(__dirname, '../dist');
let queueRunning = false;

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
  const [paperclip, hermes] = await Promise.all([getPaperclipStatus(), getHermesStatus()]);
  res.json({
    ok: true,
    service: 'ai-crm',
    composioConfigured: Boolean(process.env.COMPOSIO_API_KEY),
    paperclip,
    hermes
  });
});

app.get('/api/paperclip/status', async (req, res) => {
  res.json(await getPaperclipStatus());
});

app.get('/api/hermes/status', async (req, res) => {
  res.json(await getHermesStatus());
});

app.post('/api/agents/hermes/run', async (req, res) => {
  const bridgeToken = process.env.HERMES_BRIDGE_TOKEN || '';
  const suppliedToken = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!bridgeToken) return res.status(503).json({ error: 'HERMES_BRIDGE_TOKEN is not configured' });
  if (!suppliedToken || suppliedToken !== bridgeToken) {
    return res.status(401).json({ error: 'Invalid Hermes bridge token' });
  }

  const issueId = req.body.issueId || req.body.context?.issueId || req.body.context?.taskId;
  if (!issueId) return res.status(400).json({ error: 'Paperclip issue ID is missing from adapter payload' });

  const issue = await getPaperclipIssue(issueId);
  if (issue.status !== 'in_progress') {
    await checkoutPaperclipIssue(issueId, req.body.runId);
  }
  const result = await runHermesAgent(issue.description || issue.title, {
    sessionKey: `ai-crm:${issueId}`,
    idempotencyKey: `paperclip:${req.body.runId || issueId}`
  });
  await completePaperclipIssue(issueId, result, req.body.runId);
  res.json({ ok: true, issueId, result });
});

app.get('/api/state', async (req, res) => {
  const [state, paperclip, hermes, composio] = await Promise.all([
    loadState(),
    getPaperclipStatus(),
    getHermesStatus(),
    getGmailConfigurationStatus()
  ]);
  res.json({
    ...state,
    system: {
      paperclip,
      hermes,
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

app.post('/api/company/gather-website', async (req, res) => {
  const state = await loadState();
  const website = req.body.website || state.company.website;
  const websiteData = await gatherWebsiteData(website);
  const insights = await summarizeWebsiteForEmail({
    company: { ...state.company, website },
    websiteData
  });

  const next = await updateState((current) => ({
    ...current,
    company: {
      ...current.company,
      website,
      websiteInsights: {
        ...insights,
        sourceUrl: insights.sourceUrl || websiteData.url,
        title: insights.title || websiteData.title,
        updatedAt: insights.updatedAt || new Date().toISOString()
      }
    }
  }));

  res.json(next.company.websiteInsights);
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

app.post('/api/templates', async (req, res) => {
  const template = {
    id: createId('tpl'),
    name: req.body.name || 'New Template',
    subject: req.body.subject || '',
    body: req.body.body || '',
    tone: req.body.tone || 'professional',
    createdAt: new Date().toISOString()
  };
  await updateState((state) => ({ ...state, templates: [template, ...state.templates] }));
  res.status(201).json(template);
});

app.patch('/api/templates/:id', async (req, res) => {
  const state = await updateState((current) => ({
    ...current,
    templates: current.templates.map((template) =>
      template.id === req.params.id ? { ...template, ...req.body, updatedAt: new Date().toISOString() } : template
    )
  }));
  const template = state.templates.find((item) => item.id === req.params.id);
  if (!template) return res.status(404).json({ error: 'Template not found' });
  res.json(template);
});

app.delete('/api/templates/:id', async (req, res) => {
  await updateState((state) => ({
    ...state,
    templates: state.templates.filter((template) => template.id !== req.params.id)
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

app.post('/api/campaigns/draft', async (req, res) => {
  const state = await loadState();
  const selectedLeadIds = req.body.leadIds || [];
  const leads = state.leads.filter((lead) => selectedLeadIds.includes(lead.id));
  if (!leads.length) return res.status(400).json({ error: 'Select at least one lead' });

  const template = state.templates.find((item) => item.id === req.body.templateId) || state.templates[0];
  const draft = await generateMarketingEmailDraft({
    company: state.company,
    products: state.products,
    leads,
    template,
    goal: req.body.goal
  });

  const campaign = {
    id: createId('camp'),
    name: req.body.name || `Campaign ${new Date().toLocaleDateString()}`,
    templateId: template?.id || '',
    leadIds: leads.map((lead) => lead.id),
    subject: draft.subject,
    body: draft.body,
    goal: req.body.goal || draft.rationale,
    status: 'draft',
    delaySeconds: Number(req.body.delaySeconds || 60),
    createdAt: new Date().toISOString()
  };

  await updateState((current) => ({ ...current, campaigns: [campaign, ...current.campaigns] }));
  res.status(201).json({ campaign, draft });
});

app.post('/api/buyer-leads/generate', async (req, res) => {
  const state = await loadState();
  const webSearch = await searchBuyerCompanies({
    company: state.company,
    products: state.products,
    count: req.body.count || 8,
    region: req.body.region,
    buyerType: req.body.buyerType
  });
  if (!webSearch.candidates.length) {
    return res.status(502).json({ error: 'No buyer leads found from web search. Try a broader buyer type or region.' });
  }
  const result = await generateBuyerLeads({
    company: state.company,
    products: state.products,
    count: req.body.count || 8,
    region: req.body.region,
    buyerType: req.body.buyerType,
    webCandidates: webSearch.candidates
  });

  const buyerLeads = (result.leads || []).slice(0, 25).map((lead) => ({
    id: createId('buyer'),
    companyName: lead.companyName || 'Unnamed Buyer',
    address: lead.address || '',
    email: lead.email || '',
    website: lead.website || '',
    fitReason: lead.fitReason || '',
    interest: lead.interest || state.products[0]?.name || 'General fit',
    score: Number(lead.score || 60),
    source: 'web_ai_generated',
    verificationStatus: lead.verificationStatus || 'unverified',
    searchQuery: webSearch.query,
    stage: 'Prospect',
    createdAt: new Date().toISOString()
  }));

  await updateState((current) => ({
    ...current,
    buyerLeads: [...buyerLeads, ...current.buyerLeads]
  }));

  res.status(201).json({ buyerLeads });
});

app.patch('/api/buyer-leads/:id', async (req, res) => {
  const state = await updateState((current) => ({
    ...current,
    buyerLeads: current.buyerLeads.map((lead) =>
      lead.id === req.params.id ? { ...lead, ...req.body, updatedAt: new Date().toISOString() } : lead
    )
  }));
  const lead = state.buyerLeads.find((item) => item.id === req.params.id);
  if (!lead) return res.status(404).json({ error: 'Buyer lead not found' });
  res.json(lead);
});

app.delete('/api/buyer-leads/:id', async (req, res) => {
  await updateState((state) => ({
    ...state,
    buyerLeads: state.buyerLeads.filter((lead) => lead.id !== req.params.id)
  }));
  res.status(204).end();
});

app.post('/api/buyer-leads/queue-intros', async (req, res) => {
  const state = await loadState();
  const selectedIds = req.body.buyerLeadIds || [];
  const buyerLeads = state.buyerLeads.filter((lead) => selectedIds.includes(lead.id) && lead.email);
  if (!buyerLeads.length) return res.status(400).json({ error: 'Select at least one buyer lead with an email id' });

  const template = state.templates.find((item) => item.id === req.body.templateId) || state.templates[0];
  const delaySeconds = Math.max(5, Number(req.body.delaySeconds || 60));
  const campaignId = createId('camp');
  const queuedItems = [];

  for (const [index, buyerLead] of buyerLeads.entries()) {
    const draft = await generateBuyerIntroEmail({
      company: state.company,
      products: state.products,
      buyerLead,
      template,
      goal: req.body.goal
    });
    queuedItems.push({
      id: createId('queue'),
      campaignId,
      buyerLeadId: buyerLead.id,
      to: buyerLead.email,
      subject: draft.subject,
      body: draft.body,
      status: 'queued',
      delaySeconds,
      sequence: index + 1,
      createdAt: new Date().toISOString()
    });
  }

  const campaign = {
    id: campaignId,
    name: req.body.name || `Buyer Intro ${new Date().toLocaleDateString()}`,
    templateId: template?.id || '',
    buyerLeadIds: buyerLeads.map((lead) => lead.id),
    subject: queuedItems[0]?.subject || '',
    body: queuedItems[0]?.body || '',
    goal: req.body.goal || 'Introductory email to AI-generated buyer leads',
    status: 'queued',
    delaySeconds,
    createdAt: new Date().toISOString(),
    queuedAt: new Date().toISOString()
  };

  await updateState((current) => ({
    ...current,
    campaigns: [campaign, ...current.campaigns],
    sendQueue: [...current.sendQueue, ...queuedItems]
  }));

  res.status(201).json({ campaign, queued: queuedItems.length, sendQueue: queuedItems });
});

app.patch('/api/campaigns/:id', async (req, res) => {
  const state = await updateState((current) => ({
    ...current,
    campaigns: current.campaigns.map((campaign) =>
      campaign.id === req.params.id ? { ...campaign, ...req.body, updatedAt: new Date().toISOString() } : campaign
    )
  }));
  const campaign = state.campaigns.find((item) => item.id === req.params.id);
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
  res.json(campaign);
});

app.post('/api/campaigns/:id/queue', async (req, res) => {
  const state = await loadState();
  const campaign = state.campaigns.find((item) => item.id === req.params.id);
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

  const leads = state.leads.filter((lead) => campaign.leadIds.includes(lead.id) && lead.email);
  if (!leads.length) return res.status(400).json({ error: 'Campaign has no leads with email addresses' });

  const delaySeconds = Math.max(5, Number(req.body.delaySeconds || campaign.delaySeconds || 60));
  const queuedItems = leads.map((lead, index) => ({
    id: createId('queue'),
    campaignId: campaign.id,
    leadId: lead.id,
    to: lead.email,
    subject: renderTemplate(campaign.subject, state.company, state.products, lead),
    body: renderTemplate(campaign.body, state.company, state.products, lead),
    status: 'queued',
    delaySeconds,
    sequence: index + 1,
    createdAt: new Date().toISOString()
  }));

  await updateState((current) => ({
    ...current,
    campaigns: current.campaigns.map((item) =>
      item.id === campaign.id ? { ...item, status: 'queued', delaySeconds, queuedAt: new Date().toISOString() } : item
    ),
    sendQueue: [
      ...current.sendQueue.filter((item) => item.campaignId !== campaign.id || item.status === 'sent'),
      ...queuedItems
    ]
  }));

  res.status(201).json({ queued: queuedItems.length, delaySeconds });
});

app.post('/api/queue/run', async (req, res) => {
  if (queueRunning) return res.json({ running: true, message: 'Queue is already running' });
  queueRunning = true;
  runSendQueue().finally(() => {
    queueRunning = false;
  });
  res.json({ running: true, message: 'Queue started' });
});

app.get('/api/queue/status', async (req, res) => {
  const state = await loadState();
  res.json({
    running: queueRunning,
    counts: state.sendQueue.reduce((counts, item) => {
      counts[item.status] = (counts[item.status] || 0) + 1;
      return counts;
    }, {}),
    sendQueue: state.sendQueue
  });
});

app.post('/api/leads/:id/next-action', async (req, res) => {
  const state = await loadState();
  const lead = state.leads.find((item) => item.id === req.params.id);
  if (!lead) return res.status(404).json({ error: 'Lead not found' });
  res.json(await generateNextBestAction(lead, state.company, state.products));
});

app.delete('/api/leads/:id', async (req, res) => {
  await updateState((state) => ({
    ...state,
    leads: state.leads.filter((lead) => lead.id !== req.params.id),
    approvals: state.approvals.filter((approval) => approval.leadId !== req.params.id),
    sendQueue: state.sendQueue.filter((item) => item.leadId !== req.params.id)
  }));
  res.status(204).end();
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

app.delete('/api/approvals/:id', async (req, res) => {
  await updateState((state) => ({
    ...state,
    approvals: state.approvals.filter((approval) => approval.id !== req.params.id)
  }));
  res.status(204).end();
});

app.post('/api/approvals/:id/send', async (req, res) => {
  const state = await loadState();
  const approval = state.approvals.find((item) => item.id === req.params.id);
  if (!approval) return res.status(404).json({ error: 'Approval not found' });

  const result = await sendEmail(approval.to, approval.subject, approval.body);
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

app.listen(port, host, () => {
  console.log(`AI CRM API listening on ${publicBaseUrl}`);
});

async function runSendQueue() {
  while (true) {
    const state = await loadState();
    const nextItem = state.sendQueue
      .filter((item) => item.status === 'queued')
      .sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || '') || a.sequence - b.sequence)[0];

    if (!nextItem) return;

    await updateState((current) => ({
      ...current,
      sendQueue: current.sendQueue.map((item) =>
        item.id === nextItem.id ? { ...item, status: 'sending', startedAt: new Date().toISOString() } : item
      )
    }));

    try {
      const result = await sendEmail(nextItem.to, nextItem.subject, nextItem.body);
      await updateState((current) => ({
        ...current,
        sendQueue: current.sendQueue.map((item) =>
          item.id === nextItem.id
            ? { ...item, status: 'sent', providerId: result.id || result.message_id || '', sentAt: new Date().toISOString() }
            : item
        )
      }));
    } catch (error) {
      await updateState((current) => ({
        ...current,
        sendQueue: current.sendQueue.map((item) =>
          item.id === nextItem.id
            ? { ...item, status: 'failed', error: error.message, failedAt: new Date().toISOString() }
            : item
        )
      }));
    }

    const latest = await loadState();
    if (latest.sendQueue.some((item) => item.status === 'queued')) {
      await sleep(Math.max(5, Number(nextItem.delaySeconds || 60)) * 1000);
    }
  }
}

function renderTemplate(value, company, products, lead) {
  const firstName = (lead.contactName || lead.email || 'there').split(' ')[0];
  const productName = lead.interest || products[0]?.name || company.valueProposition || company.description || 'the company offering';
  const valueProposition = company.valueProposition || company.description || company.websiteInsights?.summary || '';
  return String(value || '')
    .replaceAll('{{firstName}}', firstName)
    .replaceAll('{{contactName}}', lead.contactName || firstName)
    .replaceAll('{{leadCompany}}', lead.companyName || '')
    .replaceAll('{{companyName}}', company.name || '')
    .replaceAll('{{valueProposition}}', valueProposition)
    .replaceAll('{{companyDescription}}', company.description || '')
    .replaceAll('{{targetAudience}}', company.targetAudience || '')
    .replaceAll('{{productName}}', productName)
    .replaceAll('{{interest}}', lead.interest || productName)
    .replaceAll('{{email}}', lead.email || '');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
