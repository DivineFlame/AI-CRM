import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Bot,
  Building2,
  Check,
  CircleAlert,
  Inbox,
  MailCheck,
  PackagePlus,
  Plus,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
  Wifi,
  WifiOff
} from 'lucide-react';
import './styles.css';

const API = import.meta.env.VITE_API_URL || '/api';

function App() {
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState('Loading workspace');
  const [notice, setNotice] = useState('');
  const [companyDraft, setCompanyDraft] = useState({});
  const [productDraft, setProductDraft] = useState({ name: '', category: '', price: '', description: '' });
  const [gmail, setGmail] = useState('');
  const [brief, setBrief] = useState(null);
  const [campaign, setCampaign] = useState(null);

  async function request(path, options = {}) {
    const response = await fetch(`${API}${path}`, {
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      ...options
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || response.statusText);
    }
    if (response.status === 204) return null;
    return response.json();
  }

  async function refresh() {
    const data = await request('/state');
    setState(data);
    setCompanyDraft(data.company);
    setGmail(data.gmail.email || '');
    setLoading('');
  }

  useEffect(() => {
    refresh().catch((error) => setLoading(error.message));
  }, []);

  const metrics = useMemo(() => {
    const leads = state?.leads || [];
    const approvals = state?.approvals || [];
    return [
      { label: 'Active leads', value: leads.length },
      { label: 'Pending approvals', value: approvals.filter((item) => item.status === 'pending').length },
      { label: 'Email drafts', value: approvals.filter((item) => item.status === 'drafted').length },
      { label: 'Avg. score', value: leads.length ? Math.round(leads.reduce((sum, lead) => sum + Number(lead.score || 0), 0) / leads.length) : 0 }
    ];
  }, [state]);

  async function saveCompany() {
    setNotice('Saving company profile');
    await request('/company', { method: 'PUT', body: JSON.stringify(companyDraft) });
    await refresh();
    setNotice('Company profile saved');
  }

  async function addProduct() {
    if (!productDraft.name.trim()) return;
    setNotice('Adding product');
    await request('/products', { method: 'POST', body: JSON.stringify(productDraft) });
    setProductDraft({ name: '', category: '', price: '', description: '' });
    await refresh();
    setNotice('Product added');
  }

  async function deleteProduct(id) {
    setNotice('Removing product');
    await request(`/products/${id}`, { method: 'DELETE' });
    await refresh();
    setNotice('Product removed');
  }

  async function connectGmail() {
    setNotice('Starting Gmail connection');
    const result = await request('/gmail/connect', { method: 'POST', body: JSON.stringify({ email: gmail }) });
    await refresh();
    setNotice(result.message || 'Gmail connection updated');
    if (result.authUrl) window.open(result.authUrl, '_blank', 'noopener,noreferrer');
  }

  async function checkComposio() {
    setNotice('Checking Composio Gmail configuration');
    await request('/composio/gmail/status');
    await refresh();
    setNotice('Composio Gmail status refreshed');
  }

  async function syncEmail() {
    setNotice('Syncing Gmail messages');
    await request('/email/sync', { method: 'POST' });
    await refresh();
    setNotice('Inbox synced');
  }

  async function analyzeEmail(emailId) {
    setNotice('Ollama is analyzing lead intent and drafting a reply');
    await request('/email/analyze', { method: 'POST', body: JSON.stringify({ emailIds: [emailId] }) });
    await refresh();
    setNotice('Lead and approval draft created');
  }

  async function updateApproval(id, body) {
    await request(`/approvals/${id}`, { method: 'PATCH', body: JSON.stringify({ body }) });
    await refresh();
  }

  async function createGmailDraft(id) {
    setNotice('Creating Gmail draft');
    await request(`/approvals/${id}/create-draft`, { method: 'POST' });
    await refresh();
    setNotice('Draft created in Gmail or local fallback');
  }

  async function sendApproved(id) {
    setNotice('Sending approved Gmail draft');
    await request(`/approvals/${id}/send`, { method: 'POST' });
    await refresh();
    setNotice('Approved draft sent');
  }

  async function generateBrief() {
    setNotice('Generating AI lead brief');
    setBrief(await request('/ai/brief', { method: 'POST' }));
    setNotice('AI brief generated');
  }

  async function generateCampaign() {
    setNotice('Drafting AI campaign');
    setCampaign(await request('/ai/campaign', { method: 'POST' }));
    setNotice('Campaign draft generated');
  }

  async function generateNextAction(leadId) {
    setNotice('Generating next best action');
    const nextAction = await request(`/leads/${leadId}/next-action`, { method: 'POST' });
    setState((current) => ({
      ...current,
      leads: current.leads.map((lead) => (lead.id === leadId ? { ...lead, aiNextAction: nextAction } : lead))
    }));
    setNotice('Next best action generated');
  }

  if (!state) {
    return <main className="boot">{loading}</main>;
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><Sparkles size={18} /></div>
          <div>
            <strong>AI CRM</strong>
            <span>Gmail intelligence</span>
          </div>
        </div>
        <nav>
          <a href="#setup"><Building2 size={18} /> Setup</a>
          <a href="#mail"><Inbox size={18} /> Inbox</a>
          <a href="#approvals"><ShieldCheck size={18} /> Approvals</a>
          <a href="#leads"><MailCheck size={18} /> Leads</a>
          <a href="#ai"><Bot size={18} /> AI</a>
        </nav>
        <StatusPanel state={state} />
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Local approval-first email automation</p>
            <h1>{state.company.name}</h1>
          </div>
          <button className="primary" onClick={syncEmail}><RefreshCw size={18} /> Sync Gmail</button>
        </header>

        {notice && <div className="notice"><CircleAlert size={16} /> {notice}</div>}

        <section className="metrics">
          {metrics.map((metric) => (
            <div className="metric" key={metric.label}>
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
            </div>
          ))}
        </section>

        <section id="setup" className="grid two">
          <div className="panel">
            <PanelTitle icon={Building2} title="Company Profile" action={<button onClick={saveCompany}><Check size={16} /> Save</button>} />
            <div className="form-grid">
              <Input label="Company name" value={companyDraft.name} onChange={(name) => setCompanyDraft({ ...companyDraft, name })} />
              <Input label="Website" value={companyDraft.website} onChange={(website) => setCompanyDraft({ ...companyDraft, website })} />
              <Input label="Industry" value={companyDraft.industry} onChange={(industry) => setCompanyDraft({ ...companyDraft, industry })} />
              <label className="field wide">
                <span>Description</span>
                <textarea value={companyDraft.description || ''} onChange={(event) => setCompanyDraft({ ...companyDraft, description: event.target.value })} />
              </label>
            </div>
          </div>

          <div className="panel">
            <PanelTitle
              icon={Wifi}
              title="Gmail via Composio"
              action={<div className="button-row"><button onClick={checkComposio}><RefreshCw size={16} /> Check</button><button onClick={connectGmail}><ShieldCheck size={16} /> Connect</button></div>}
            />
            <div className="gmail-row">
              <Input label="Gmail address" value={gmail} onChange={setGmail} />
              <div className="status-pill">{state.gmail.connectionStatus.replaceAll('_', ' ')}</div>
            </div>
            {state.gmail.message && <p className="muted">{state.gmail.message}</p>}
            {state.gmail.authUrl && <a className="link" href={state.gmail.authUrl} target="_blank" rel="noreferrer">Open Composio authorization</a>}
            <div className="config-list">
              <span>API key: <b>{state.system.composio.apiKey ? 'configured' : 'missing'}</b></span>
              <span>Gmail auth config: <b>{state.system.composio.authConfigId ? 'configured' : 'missing'}</b></span>
              <span>Active Gmail accounts: <b>{state.system.composio.accounts?.filter((account) => String(account.status).toLowerCase() === 'active').length || 0}</b></span>
            </div>
          </div>
        </section>

        <section className="panel">
          <PanelTitle icon={PackagePlus} title="Products" action={<button onClick={addProduct}><Plus size={16} /> Add</button>} />
          <div className="product-form">
            <Input label="Product" value={productDraft.name} onChange={(name) => setProductDraft({ ...productDraft, name })} />
            <Input label="Category" value={productDraft.category} onChange={(category) => setProductDraft({ ...productDraft, category })} />
            <Input label="Price" value={productDraft.price} onChange={(price) => setProductDraft({ ...productDraft, price })} />
            <Input label="Description" value={productDraft.description} onChange={(description) => setProductDraft({ ...productDraft, description })} />
          </div>
          <div className="products">
            {state.products.map((product) => (
              <article className="item-card" key={product.id}>
                <div>
                  <strong>{product.name}</strong>
                  <span>{product.category || 'Product'} · {product.price || 'Price TBD'}</span>
                  <p>{product.description}</p>
                </div>
                <button className="icon danger" title="Remove product" onClick={() => deleteProduct(product.id)}><Trash2 size={16} /></button>
              </article>
            ))}
          </div>
        </section>

        <section id="mail" className="panel">
          <PanelTitle icon={Inbox} title="Recent Gmail Communication" action={<button onClick={syncEmail}><RefreshCw size={16} /> Sync</button>} />
          <div className="email-list">
            {state.emails.map((email) => (
              <article className="email-row" key={email.id}>
                <div>
                  <strong>{email.subject}</strong>
                  <span>{email.from} · {new Date(email.receivedAt).toLocaleString()}</span>
                  <p>{email.body}</p>
                </div>
                <button className="primary" onClick={() => analyzeEmail(email.id)}><Bot size={16} /> Analyze</button>
              </article>
            ))}
            {!state.emails.length && <Empty text="Sync Gmail to load recent conversations." />}
          </div>
        </section>

        <section id="approvals" className="panel">
          <PanelTitle icon={ShieldCheck} title="Human Approval Queue" />
          <div className="approval-grid">
            {state.approvals.map((approval) => (
              <article className="approval" key={approval.id}>
                <div className="approval-head">
                  <div>
                    <strong>{approval.subject}</strong>
                    <span>To {approval.to}</span>
                  </div>
                  <span className={`status ${approval.status}`}>{approval.status}</span>
                </div>
                <textarea value={approval.body} onChange={(event) => updateApproval(approval.id, event.target.value)} />
                <div className="actions">
                  <button onClick={() => createGmailDraft(approval.id)}><MailCheck size={16} /> Draft</button>
                  <button className="primary" disabled={approval.status === 'sent'} onClick={() => sendApproved(approval.id)}><Send size={16} /> Send Approved</button>
                </div>
              </article>
            ))}
            {!state.approvals.length && <Empty text="Analyze an email to create an approval draft." />}
          </div>
        </section>

        <section id="leads" className="panel">
          <PanelTitle icon={MailCheck} title="Lead Module" />
          <div className="lead-table">
            <div className="table-head"><span>Lead</span><span>Interest</span><span>Stage</span><span>Score</span><span>Next action</span></div>
            {state.leads.map((lead) => (
              <div className="table-row" key={lead.id}>
                <span><strong>{lead.companyName}</strong><small>{lead.contactName} · {lead.email}</small></span>
                <span>{lead.interest}</span>
                <span><b>{lead.stage}</b></span>
                <span>{lead.score}</span>
                <span>
                  {lead.aiNextAction?.action || lead.nextAction}
                  {lead.aiNextAction?.rationale && <small>{lead.aiNextAction.rationale}</small>}
                  <button className="small-action" onClick={() => generateNextAction(lead.id)}><Sparkles size={14} /> AI action</button>
                </span>
              </div>
            ))}
          </div>
          {!state.leads.length && <Empty text="Qualified leads will appear after inbox analysis." />}
        </section>

        <section id="ai" className="grid two">
          <div className="panel">
            <PanelTitle icon={Bot} title="AI Sales Brief" action={<button onClick={generateBrief}><Sparkles size={16} /> Generate</button>} />
            {brief ? (
              <div className="ai-output">
                <p>{brief.summary}</p>
                <strong>Priorities</strong>
                {brief.priorities?.map((item) => <span key={`${item.leadId}-${item.title}`}>{item.title}: {item.action}</span>)}
                <strong>Risks</strong>
                {brief.risks?.map((risk) => <span key={risk}>{risk}</span>)}
              </div>
            ) : <Empty text="Generate an AI brief after leads are created." />}
          </div>

          <div className="panel">
            <PanelTitle icon={Sparkles} title="AI Campaign Draft" action={<button onClick={generateCampaign}><Bot size={16} /> Draft</button>} />
            {campaign ? (
              <div className="ai-output">
                <strong>{campaign.subject}</strong>
                <textarea value={campaign.body || ''} onChange={(event) => setCampaign({ ...campaign, body: event.target.value })} />
                <span>Goal: {campaign.goal}</span>
                <span>Audience: {campaign.audience?.length || 0} lead(s)</span>
              </div>
            ) : <Empty text="Draft a nurture campaign from current leads and products." />}
          </div>
        </section>
      </section>
    </main>
  );
}

function StatusPanel({ state }) {
  const ollamaOnline = state.system.ollama.online;
  return (
    <div className="system">
      <div className="system-row">
        {ollamaOnline ? <Wifi size={16} /> : <WifiOff size={16} />}
        <span>Ollama</span>
        <b>{ollamaOnline ? state.system.ollama.model : 'offline'}</b>
      </div>
      <div className="system-row">
        {state.system.composioConfigured ? <Wifi size={16} /> : <WifiOff size={16} />}
        <span>Composio</span>
        <b>{state.system.composioConfigured ? 'ready' : state.system.composio.apiKey ? 'check auth' : 'env needed'}</b>
      </div>
    </div>
  );
}

function PanelTitle({ icon: Icon, title, action }) {
  return (
    <div className="panel-title">
      <h2><Icon size={19} /> {title}</h2>
      {action}
    </div>
  );
}

function Input({ label, value = '', onChange }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function Empty({ text }) {
  return <div className="empty">{text}</div>;
}

createRoot(document.getElementById('root')).render(<App />);
