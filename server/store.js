import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const dataDir = path.resolve('server/data');
const dataFile = path.join(dataDir, 'crm.json');

const seed = {
  company: {
    name: 'Acme Growth Systems',
    website: 'https://example.com',
    industry: 'B2B SaaS',
    description: 'AI-enabled CRM and sales automation for growing teams.'
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
    leads: Array.isArray(saved.leads) ? saved.leads : seed.leads,
    emails: Array.isArray(saved.emails) ? saved.emails : seed.emails
  };
}
