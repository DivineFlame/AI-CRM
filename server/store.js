import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const dataDir = path.resolve('server/data');
const dataFile = path.join(dataDir, 'crm.json');

const seed = {
  company: {
    name: 'Acme Growth Systems',
    website: 'https://example.com',
    industry: 'B2B SaaS',
    email: '',
    phone: '',
    address: '',
    targetAudience: 'Growing sales teams',
    valueProposition: 'Approval-first AI email automation for CRM workflows.',
    tone: 'professional and consultative',
    description: 'AI-enabled CRM and sales automation for growing teams.',
    websiteInsights: {
      sourceUrl: '',
      title: '',
      summary: '',
      keyMessages: [],
      suggestedAngles: [],
      updatedAt: null
    }
  },
  products: [
    {
      id: 'prod_crm',
      name: 'AI Sales Workspace',
      category: 'CRM',
      price: 'Custom',
      description: 'Unified lead tracking, email intelligence, and approval-first outreach.'
    }
  ],
  gmail: {
    email: '',
    connectionStatus: 'not_connected',
    connectedAccountId: '',
    authUrl: '',
    lastSync: null,
    message: ''
  },
  approvals: [],
  templates: [
    {
      id: 'tpl_intro',
      name: 'Intro Outreach',
      subject: 'A practical next step with {{productName}}',
      body: 'Hi {{firstName}},\n\nBased on your interest in {{productName}}, {{companyName}} can help your team move faster while keeping outreach under human approval.\n\nWould a short walkthrough be useful this week?\n\nBest,\n{{companyName}}',
      tone: 'consultative',
      createdAt: new Date().toISOString()
    },
    {
      id: 'tpl_follow_up',
      name: 'Warm Follow-up',
      subject: 'Following up on {{interest}}',
      body: 'Hi {{firstName}},\n\nI wanted to follow up on your interest in {{interest}}. {{companyName}} can help with a focused workflow for lead qualification, email drafting, and approval-based sending.\n\nIs there a good time to compare notes this week?\n\nBest,\n{{companyName}}',
      tone: 'warm',
      createdAt: new Date().toISOString()
    }
  ],
  campaigns: [],
  sendQueue: [],
  leads: [],
  emails: []
};

export async function loadState() {
  try {
    const raw = await readFile(dataFile, 'utf8');
    return mergeState(JSON.parse(raw));
  } catch {
    await saveState(seed);
    return structuredClone(seed);
  }
}

export async function saveState(state) {
  await mkdir(dataDir, { recursive: true });
  await writeFile(dataFile, JSON.stringify(state, null, 2));
  return state;
}

export async function updateState(updater) {
  const state = await loadState();
  const next = await updater(state);
  await saveState(next);
  return next;
}

export function createId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function mergeState(saved) {
  return {
    ...seed,
    ...saved,
    company: { ...seed.company, ...(saved.company || {}) },
    gmail: { ...seed.gmail, ...(saved.gmail || {}) },
    products: Array.isArray(saved.products) ? saved.products : seed.products,
    approvals: Array.isArray(saved.approvals) ? saved.approvals : seed.approvals,
    templates: Array.isArray(saved.templates) ? saved.templates : seed.templates,
    campaigns: Array.isArray(saved.campaigns) ? saved.campaigns : seed.campaigns,
    sendQueue: Array.isArray(saved.sendQueue) ? saved.sendQueue : seed.sendQueue,
    leads: Array.isArray(saved.leads) ? saved.leads : seed.leads,
    emails: Array.isArray(saved.emails) ? saved.emails : seed.emails
  };
}
