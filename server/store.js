import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const dataDir = path.resolve('server/data');
const dataFile = path.join(dataDir, 'crm.json');

const seed = {
  company: {
    name: '',
    website: '',
    industry: '',
    email: '',
    phone: '',
    address: '',
    targetAudience: '',
    valueProposition: '',
    tone: '',
    description: '',
    websiteInsights: {
      sourceUrl: '',
      title: '',
      summary: '',
      keyMessages: [],
      suggestedAngles: [],
      updatedAt: null
    }
  },
  products: [],
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
      body: 'Hi {{firstName}},\n\nI wanted to introduce {{companyName}}. {{valueProposition}}\n\nWould a short conversation be useful this week?\n\nBest,\n{{companyName}}',
      tone: 'consultative',
      createdAt: new Date().toISOString()
    },
    {
      id: 'tpl_follow_up',
      name: 'Warm Follow-up',
      subject: 'Following up on {{interest}}',
      body: 'Hi {{firstName}},\n\nI wanted to follow up on {{interest}}. {{valueProposition}}\n\nIs there a good time to compare notes this week?\n\nBest,\n{{companyName}}',
      tone: 'warm',
      createdAt: new Date().toISOString()
    }
  ],
  campaigns: [],
  sendQueue: [],
  buyerLeads: [],
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
  const migrated = migrateLegacyDefaults(saved);
  return {
    ...seed,
    ...migrated,
    company: { ...seed.company, ...(migrated.company || {}) },
    gmail: { ...seed.gmail, ...(migrated.gmail || {}) },
    products: Array.isArray(migrated.products) ? migrated.products : seed.products,
    approvals: Array.isArray(migrated.approvals) ? migrated.approvals : seed.approvals,
    templates: Array.isArray(migrated.templates) ? migrated.templates : seed.templates,
    campaigns: Array.isArray(migrated.campaigns) ? migrated.campaigns : seed.campaigns,
    sendQueue: Array.isArray(migrated.sendQueue) ? migrated.sendQueue : seed.sendQueue,
    buyerLeads: Array.isArray(migrated.buyerLeads) ? migrated.buyerLeads : seed.buyerLeads,
    leads: Array.isArray(migrated.leads) ? migrated.leads : seed.leads,
    emails: Array.isArray(migrated.emails) ? migrated.emails : seed.emails
  };
}

function migrateLegacyDefaults(saved) {
  const next = structuredClone(saved || {});
  const hasLegacyProduct = Array.isArray(next.products) && next.products.length === 1 && next.products[0]?.id === 'prod_crm';
  if (hasLegacyProduct) {
    next.company = { ...seed.company };
  }
  if (hasLegacyProduct) {
    next.products = [];
  }
  if (Array.isArray(next.templates)) {
    next.templates = next.templates.map((template) => {
      const seedTemplate = seed.templates.find((item) => item.id === template.id);
      return seedTemplate && template.body !== seedTemplate.body ? seedTemplate : template;
    });
  }
  return next;
}
