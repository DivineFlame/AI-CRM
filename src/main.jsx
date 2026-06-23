import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Bot,
  Building2,
  Check,
  CircleAlert,
  Clock,
  FileText,
  Inbox,
  MailCheck,
  PackagePlus,
  Plus,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
  Users,
  Wifi,
  WifiOff
} from 'lucide-react';
import './styles.css';

const API = import.meta.env.VITE_API_URL || '/api';

function App() {
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState('Loading workspace');
  const [notice, setNotice] = useState('');
  const [activePanel, setActivePanel] = useState(0);
  const [companyDraft, setCompanyDraft] = useState({});
  const [productDraft, setProductDraft] = useState({ name: '', category: '', price: '', description: '' });
  const [gmail, setGmail] = useState('');
  const [brief, setBrief] = useState(null);
  const [campaign, setCampaign] = useState(null);
  const [templateDraft, setTemplateDraft] = useState({
    name: '',
    subject: '',
    body: '',
    tone: 'professional'
  });
  const [campaignBuilder, setCampaignBuilder] = useState({
    name: '',
    templateId: '',
    goal: 'Create a helpful marketing email for selected warm leads.',
    delaySeconds: 60,
    leadIds: []
  });
  const [buyerGenerator, setBuyerGenerator] = useState({
    count: 8,
    region: '',
    buyerType: '',
    goal: 'Send a concise intro email to relevant buyer companies.',
    delaySeconds: 60,
    templateId: ''
  });
  const [selectedBuyerLeadIds, setSelectedBuyerLeadIds] = useState([]);

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
      { label: 'Buyer leads', value: state?.buyerLeads?.length || 0 },
      { label: 'Pending approvals', value: approvals.filter((item) => item.status === 'pending').length },
      { label: 'Approved sent', value: approvals.filter((item) => item.status === 'sent').length },
      { label: 'Queued sends', value: state?.sendQueue?.filter((item) => ['queued', 'sending'].includes(item.status)).length || 0 },
      { label: 'Avg. score', value: leads.length ? Math.round(leads.reduce((sum, lead) => sum + Number(lead.score || 0), 0) / leads.length) : 0 }
    ];
  }, [state]);

  const panelDefs = [
    { id: 'setup', label: 'Setup' },
    { id: 'products', label: 'Products' },
    { id: 'mail', label: 'Inbox' },
    { id: 'approvals', label: 'Approvals' },
    { id: 'leads', label: 'Leads' },
    { id: 'buyers', label: 'Buyers' },
    { id: 'ai', label: 'AI' },
    { id: 'campaigns', label: 'Campaigns' },
    { id: 'queue', label: 'Queue' }
  ];

  async function saveCompany() {
    setNotice('Saving company profile');
    await request('/company', { method: 'PUT', body: JSON.stringify(companyDraft) });
    await refresh();
    setNotice('Company profile saved');
  }

  async function gatherWebsiteInfo() {
    setNotice('Gathering company website intelligence for email communication');
    const insights = await request('/company/gather-website', {
      method: 'POST',
      body: JSON.stringify({ website: companyDraft.website })
    });
    await refresh();
    setNotice(`Website intelligence updated: ${insights.title || insights.sourceUrl}`);
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

  async function sendApproved(id) {
    setNotice('Sending approved email through Gmail');
    await request(`/approvals/${id}/send`, { method: 'POST' });
    await refresh();
    setNotice('Approved email sent');
  }

  async function addTemplate() {
    if (!templateDraft.name.trim()) return;
    setNotice('Adding email template');
    await request('/templates', { method: 'POST', body: JSON.stringify(templateDraft) });
    setTemplateDraft({ name: '', subject: '', body: '', tone: 'professional' });
    await refresh();
    setNotice('Email template added');
  }

  async function updateTemplate(id, patch) {
    await request(`/templates/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
    await refresh();
  }

  async function deleteTemplate(id) {
    setNotice('Removing email template');
    await request(`/templates/${id}`, { method: 'DELETE' });
    await refresh();
    setNotice('Email template removed');
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

  async function generateSelectedCampaign() {
    setNotice('AI is drafting a marketing email from templates and selected leads');
    const result = await request('/campaigns/draft', {
      method: 'POST',
      body: JSON.stringify(campaignBuilder)
    });
    setCampaign(result.campaign);
    await refresh();
    setNotice('Marketing campaign draft created');
  }

  async function saveCampaignDraft(patch) {
    if (!campaign?.id) {
      setCampaign({ ...campaign, ...patch });
      return;
    }
    const saved = await request(`/campaigns/${campaign.id}`, { method: 'PATCH', body: JSON.stringify(patch) });
    setCampaign(saved);
    await refresh();
  }

  async function queueCampaign() {
    if (!campaign?.id) return;
    setNotice('Adding selected campaign recipients to send queue');
    await request(`/campaigns/${campaign.id}/queue`, {
      method: 'POST',
      body: JSON.stringify({ delaySeconds: campaign.delaySeconds || campaignBuilder.delaySeconds })
    });
    await refresh();
    setNotice('Campaign queued for approval-based sending');
  }

  async function runQueue() {
    setNotice('Starting send queue with delay between emails');
    await request('/queue/run', { method: 'POST' });
    await refresh();
    setNotice('Send queue started');
  }

  function toggleLead(leadId) {
    setCampaignBuilder((current) => ({
      ...current,
      leadIds: current.leadIds.includes(leadId)
        ? current.leadIds.filter((id) => id !== leadId)
        : [...current.leadIds, leadId]
    }));
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

  async function generateBuyerLeadList() {
    setNotice('AI is generating buyer leads from the company profile');
    const result = await request('/buyer-leads/generate', {
      method: 'POST',
      body: JSON.stringify(buyerGenerator)
    });
    setSelectedBuyerLeadIds(result.buyerLeads.map((lead) => lead.id));
    await refresh();
    setNotice(`${result.buyerLeads.length} AI buyer leads generated`);
  }

  async function deleteBuyerLead(id) {
    await request(`/buyer-leads/${id}`, { method: 'DELETE' });
    setSelectedBuyerLeadIds((current) => current.filter((leadId) => leadId !== id));
    await refresh();
  }

  async function queueBuyerIntroEmails() {
    setNotice('Creating intro emails for selected buyer leads');
    await request('/buyer-leads/queue-intros', {
      method: 'POST',
      body: JSON.stringify({
        ...buyerGenerator,
        buyerLeadIds: selectedBuyerLeadIds,
        templateId: buyerGenerator.templateId || state.templates[0]?.id || ''
      })
    });
    await refresh();
    setActivePanel(panelDefs.findIndex((panel) => panel.id === 'queue'));
    setNotice('Buyer intro emails queued');
  }

  function toggleBuyerLead(id) {
    setSelectedBuyerLeadIds((current) =>
      current.includes(id) ? current.filter((leadId) => leadId !== id) : [...current, id]
    );
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
          <a href="#buyers"><Users size={18} /> Buyers</a>
          <a href="#ai"><Bot size={18} /> AI</a>
          <a href="#campaigns"><Users size={18} /> Campaigns</a>
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

        <section className="panel-switcher">
          <div className="switcher-head">
            <strong>{panelDefs[activePanel].label}</strong>
            <span>{activePanel + 1} / {panelDefs.length}</span>
          </div>
          <input
            type="range"
            min="0"
            max={panelDefs.length - 1}
            value={activePanel}
            onChange={(event) => setActivePanel(Number(event.target.value))}
          />
          <div className="panel-tabs">
            {panelDefs.map((panel, index) => (
              <button
                className={index === activePanel ? 'active-tab' : ''}
                key={panel.id}
                onClick={() => setActivePanel(index)}
              >
                {panel.label}
              </button>
            ))}
          </div>
        </section>

        <section id="setup" className={`data-slide grid two ${activePanel === 0 ? 'active' : ''}`}>
          <div className="panel">
            <PanelTitle icon={Building2} title="Company Profile" action={<div className="button-row"><button onClick={gatherWebsiteInfo}><Sparkles size={16} /> Gather Website</button><button onClick={saveCompany}><Check size={16} /> Save</button></div>} />
            <div className="form-grid">
              <Input label="Company name" value={companyDraft.name} onChange={(name) => setCompanyDraft({ ...companyDraft, name })} />
              <Input label="Website" value={companyDraft.website} onChange={(website) => setCompanyDraft({ ...companyDraft, website })} />
              <Input label="Industry" value={companyDraft.industry} onChange={(industry) => setCompanyDraft({ ...companyDraft, industry })} />
              <Input label="Email" value={companyDraft.email} onChange={(email) => setCompanyDraft({ ...companyDraft, email })} />
              <Input label="Phone" value={companyDraft.phone} onChange={(phone) => setCompanyDraft({ ...companyDraft, phone })} />
              <Input label="Address" value={companyDraft.address} onChange={(address) => setCompanyDraft({ ...companyDraft, address })} />
              <Input label="Target audience" value={companyDraft.targetAudience} onChange={(targetAudience) => setCompanyDraft({ ...companyDraft, targetAudience })} />
              <Input label="Email tone" value={companyDraft.tone} onChange={(tone) => setCompanyDraft({ ...companyDraft, tone })} />
              <label className="field wide">
                <span>Description</span>
                <textarea value={companyDraft.description || ''} onChange={(event) => setCompanyDraft({ ...companyDraft, description: event.target.value })} />
              </label>
              <label className="field wide">
                <span>Value proposition</span>
                <textarea value={companyDraft.valueProposition || ''} onChange={(event) => setCompanyDraft({ ...companyDraft, valueProposition: event.target.value })} />
              </label>
            </div>
            {state.company.websiteInsights?.summary && (
              <div className="insight-box">
                <strong>{state.company.websiteInsights.title || 'Website intelligence'}</strong>
                <p>{state.company.websiteInsights.summary}</p>
                <span>{state.company.websiteInsights.keyMessages?.slice(0, 3).join(' · ')}</span>
              </div>
            )}
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

        <section id="products" className={`data-slide panel ${activePanel === 1 ? 'active' : ''}`}>
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

        <section id="mail" className={`data-slide panel ${activePanel === 2 ? 'active' : ''}`}>
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

        <section id="approvals" className={`data-slide panel ${activePanel === 3 ? 'active' : ''}`}>
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
                  <button className="primary" disabled={approval.status === 'sent'} onClick={() => sendApproved(approval.id)}><Send size={16} /> Send Email</button>
                </div>
              </article>
            ))}
            {!state.approvals.length && <Empty text="Analyze an email to create an approval draft." />}
          </div>
        </section>

        <section id="leads" className={`data-slide panel ${activePanel === 4 ? 'active' : ''}`}>
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

        <section id="buyers" className={`data-slide panel ${activePanel === 5 ? 'active' : ''}`}>
          <PanelTitle icon={Users} title="AI Buyer Lead Generation" action={<div className="button-row"><button onClick={generateBuyerLeadList}><Sparkles size={16} /> Generate</button><button className="primary" onClick={queueBuyerIntroEmails}><Send size={16} /> Queue Intros</button></div>} />
          <div className="form-grid">
            <Input label="Lead count" value={String(buyerGenerator.count)} onChange={(count) => setBuyerGenerator({ ...buyerGenerator, count })} />
            <Input label="Buyer type" value={buyerGenerator.buyerType} onChange={(buyerType) => setBuyerGenerator({ ...buyerGenerator, buyerType })} />
            <Input label="Region or address area" value={buyerGenerator.region} onChange={(region) => setBuyerGenerator({ ...buyerGenerator, region })} />
            <Input label="Delay between intro emails, seconds" value={String(buyerGenerator.delaySeconds)} onChange={(delaySeconds) => setBuyerGenerator({ ...buyerGenerator, delaySeconds })} />
            <label className="field">
              <span>Intro template</span>
              <select value={buyerGenerator.templateId || state.templates[0]?.id || ''} onChange={(event) => setBuyerGenerator({ ...buyerGenerator, templateId: event.target.value })}>
                {state.templates.map((template) => <option value={template.id} key={template.id}>{template.name}</option>)}
              </select>
            </label>
            <label className="field wide">
              <span>Intro email goal</span>
              <textarea value={buyerGenerator.goal} onChange={(event) => setBuyerGenerator({ ...buyerGenerator, goal: event.target.value })} />
            </label>
          </div>
          <div className="buyer-list">
            {state.buyerLeads.map((lead) => (
              <article className="buyer-row" key={lead.id}>
                <label>
                  <input type="checkbox" checked={selectedBuyerLeadIds.includes(lead.id)} onChange={() => toggleBuyerLead(lead.id)} />
                  <span>
                    <strong>{lead.companyName}</strong>
                    <small>{lead.address} · {lead.email}</small>
                    <small>{lead.fitReason}</small>
                  </span>
                </label>
                <div className="buyer-actions">
                  <span className="status unverified">{lead.verificationStatus}</span>
                  <button className="icon danger" title="Remove buyer lead" onClick={() => deleteBuyerLead(lead.id)}><Trash2 size={16} /></button>
                </div>
              </article>
            ))}
            {!state.buyerLeads.length && <Empty text="Generate buyer leads from the company profile, products, and website intelligence." />}
          </div>
        </section>

        <section id="ai" className={`data-slide grid two ${activePanel === 6 ? 'active' : ''}`}>
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

        <section id="campaigns" className={`data-slide grid two ${activePanel === 7 ? 'active' : ''}`}>
          <div className="panel">
            <PanelTitle icon={FileText} title="Email Templates" action={<button onClick={addTemplate}><Plus size={16} /> Add</button>} />
            <div className="form-grid">
              <Input label="Template name" value={templateDraft.name} onChange={(name) => setTemplateDraft({ ...templateDraft, name })} />
              <Input label="Tone" value={templateDraft.tone} onChange={(tone) => setTemplateDraft({ ...templateDraft, tone })} />
              <Input label="Subject" value={templateDraft.subject} onChange={(subject) => setTemplateDraft({ ...templateDraft, subject })} />
              <label className="field wide">
                <span>Body</span>
                <textarea value={templateDraft.body} onChange={(event) => setTemplateDraft({ ...templateDraft, body: event.target.value })} />
              </label>
            </div>
            <div className="template-list">
              {state.templates.map((template) => (
                <article className="template-card" key={template.id}>
                  <div className="approval-head">
                    <div>
                      <strong>{template.name}</strong>
                      <span>{template.tone} · {template.subject}</span>
                    </div>
                    <button className="icon danger" title="Remove template" onClick={() => deleteTemplate(template.id)}><Trash2 size={16} /></button>
                  </div>
                  <textarea value={template.body} onChange={(event) => updateTemplate(template.id, { body: event.target.value })} />
                </article>
              ))}
            </div>
          </div>

          <div className="panel">
            <PanelTitle icon={Users} title="Selected-List Marketing" action={<button onClick={generateSelectedCampaign}><Sparkles size={16} /> AI Draft</button>} />
            <div className="form-grid">
              <Input label="Campaign name" value={campaignBuilder.name} onChange={(name) => setCampaignBuilder({ ...campaignBuilder, name })} />
              <label className="field">
                <span>Template</span>
                <select value={campaignBuilder.templateId || state.templates[0]?.id || ''} onChange={(event) => setCampaignBuilder({ ...campaignBuilder, templateId: event.target.value })}>
                  {state.templates.map((template) => <option value={template.id} key={template.id}>{template.name}</option>)}
                </select>
              </label>
              <Input label="Delay between emails, seconds" value={String(campaignBuilder.delaySeconds)} onChange={(delaySeconds) => setCampaignBuilder({ ...campaignBuilder, delaySeconds })} />
              <label className="field wide">
                <span>AI goal</span>
                <textarea value={campaignBuilder.goal} onChange={(event) => setCampaignBuilder({ ...campaignBuilder, goal: event.target.value })} />
              </label>
            </div>
            <div className="recipient-list">
              {state.leads.map((lead) => (
                <label className="recipient-row" key={lead.id}>
                  <input type="checkbox" checked={campaignBuilder.leadIds.includes(lead.id)} onChange={() => toggleLead(lead.id)} />
                  <span><strong>{lead.contactName || lead.companyName}</strong><small>{lead.email} · {lead.interest}</small></span>
                </label>
              ))}
              {!state.leads.length && <Empty text="Create leads from Gmail before selecting a campaign audience." />}
            </div>
          </div>
        </section>

        <section id="queue" className={`data-slide panel ${activePanel === 8 ? 'active' : ''}`}>
          <PanelTitle icon={Clock} title="Campaign Queue" action={<button className="primary" onClick={runQueue}><Send size={16} /> Run Queue</button>} />
          {campaign && (
            <div className="campaign-editor">
              <Input label="Subject" value={campaign.subject || ''} onChange={(subject) => saveCampaignDraft({ subject })} />
              <label className="field">
                <span>Approved marketing email</span>
                <textarea value={campaign.body || ''} onChange={(event) => saveCampaignDraft({ body: event.target.value })} />
              </label>
              <div className="actions">
                <span className="status-pill">{campaign.status || 'draft'}</span>
                <button onClick={queueCampaign}><Clock size={16} /> Queue Selected List</button>
              </div>
            </div>
          )}
          <div className="queue-list">
            {state.sendQueue.map((item) => (
              <article className="queue-row" key={item.id}>
                <div>
                  <strong>{item.subject}</strong>
                  <span>{item.to} · wait {item.delaySeconds}s</span>
                </div>
                <span className={`status ${item.status}`}>{item.status}</span>
              </article>
            ))}
            {!state.sendQueue.length && <Empty text="Queue a campaign to send one email at a time with a delay." />}
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
