const PAPERCLIP_BASE_URL = (process.env.PAPERCLIP_BASE_URL || 'http://127.0.0.1:3100').replace(/\/+$/, '');
const PAPERCLIP_COMPANY_ID = process.env.PAPERCLIP_COMPANY_ID || '';
const PAPERCLIP_AGENT_ID = process.env.PAPERCLIP_AGENT_ID || '';
const PAPERCLIP_API_KEY = process.env.PAPERCLIP_API_KEY || '';
const PAPERCLIP_TIMEOUT_MS = Math.max(Number(process.env.PAPERCLIP_TIMEOUT_MS || 120000), 5000);
const PAPERCLIP_POLL_INTERVAL_MS = Math.max(Number(process.env.PAPERCLIP_POLL_INTERVAL_MS || 1500), 500);
const RESULT_MARKER = 'AI_CRM_RESULT:';

export async function getPaperclipStatus() {
  const configured = Boolean(PAPERCLIP_COMPANY_ID && PAPERCLIP_AGENT_ID && PAPERCLIP_API_KEY);
  if (!configured) {
    return {
      online: false,
      configured: false,
      agent: 'not configured',
      error: 'Paperclip company, agent, and API key are required'
    };
  }

  try {
    const agent = await paperclipRequest(`/api/agents/${PAPERCLIP_AGENT_ID}`);
    if (agent.companyId && agent.companyId !== PAPERCLIP_COMPANY_ID) {
      throw new Error('Configured Paperclip agent does not belong to PAPERCLIP_COMPANY_ID');
    }
    return {
      online: true,
      configured: true,
      agent: agent.name || agent.title || PAPERCLIP_AGENT_ID,
      agentStatus: agent.status || 'unknown',
      adapterType: agent.adapterType || '',
      companyId: agent.companyId || PAPERCLIP_COMPANY_ID
    };
  } catch (error) {
    return {
      online: false,
      configured: true,
      agent: PAPERCLIP_AGENT_ID,
      error: error.message
    };
  }
}

export async function generateWithPaperclip(prompt, _fallback, taskType = 'crm-generation') {
  if (!PAPERCLIP_COMPANY_ID || !PAPERCLIP_AGENT_ID || !PAPERCLIP_API_KEY) {
    throw new Error('Paperclip is not configured. Set PAPERCLIP_COMPANY_ID, PAPERCLIP_AGENT_ID, and PAPERCLIP_API_KEY.');
  }

  try {
    const issue = await paperclipRequest(`/api/companies/${PAPERCLIP_COMPANY_ID}/issues`, {
      method: 'POST',
      body: {
        title: `AI CRM: ${taskType}`,
        description: buildAgentTask(prompt),
        status: 'todo',
        priority: 'high',
        assigneeAgentId: PAPERCLIP_AGENT_ID
      }
    });
    if (!issue.id) throw new Error('Paperclip did not return an issue ID');

    await paperclipRequest(`/api/agents/${PAPERCLIP_AGENT_ID}/heartbeat/invoke`, {
      method: 'POST',
      body: {
        reason: 'AI CRM requested generation',
        payload: { issueId: issue.id, source: 'ai-crm', taskType },
        idempotencyKey: `ai-crm:${issue.id}`,
        forceFreshSession: true
      }
    });

    return await waitForAgentResult(issue.id);
  } catch (error) {
    console.warn(`Paperclip ${taskType} failed:`, error.message);
    throw error;
  }
}

export async function getPaperclipIssue(issueId) {
  if (!issueId) throw new Error('Paperclip issue ID is required');
  return paperclipRequest(`/api/issues/${issueId}`);
}

export async function checkoutPaperclipIssue(issueId, runId) {
  return paperclipRequest(`/api/issues/${issueId}/checkout`, {
    method: 'POST',
    headers: runId ? { 'X-Paperclip-Run-Id': runId } : {},
    body: {
      agentId: PAPERCLIP_AGENT_ID,
      expectedStatuses: ['todo', 'backlog', 'in_review', 'blocked', 'in_progress']
    }
  });
}

export async function completePaperclipIssue(issueId, result, runId) {
  await paperclipRequest(`/api/issues/${issueId}/comments`, {
    method: 'POST',
    headers: runId ? { 'X-Paperclip-Run-Id': runId } : {},
    body: { body: `${RESULT_MARKER}${result}` }
  });
  return paperclipRequest(`/api/issues/${issueId}`, {
    method: 'PATCH',
    headers: runId ? { 'X-Paperclip-Run-Id': runId } : {},
    body: { status: 'done' }
  });
}

export async function analyzeEmailForLead(email, company, products) {
  const productList = products.map((product) => `${product.name}: ${product.description}`).join('\n');
  const websiteContext = formatWebsiteContext(company);
  const productName = getPrimaryProductName(products);
  const fallback = JSON.stringify({
    companyName: email.fromName || email.from?.split('@')[1] || 'Unknown',
    contactName: email.fromName || email.from,
    email: email.from,
    stage: 'New',
    score: 72,
    interest: productName || company.valueProposition || 'Company profile review required',
    summary: `Potential lead from email: ${email.subject}`,
    nextAction: 'Review and approve a personalized reply.'
  });

  const prompt = `You are a CRM lead analyst. Return only valid JSON.
Company profile:
${company.name} - ${company.description}
Target audience: ${company.targetAudience || ''}
Value proposition: ${company.valueProposition || ''}
Website context:
${websiteContext}

Products:
${productList}

Email:
From: ${email.from}
Subject: ${email.subject}
Body: ${email.body}

JSON schema:
{"companyName":"","contactName":"","email":"","stage":"New|Qualified|Proposal|Nurture","score":0,"interest":"","summary":"","nextAction":""}`;

  const raw = await generateWithPaperclip(prompt, fallback, 'analyze-email-lead');
  try {
    return JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] || raw);
  } catch {
    return JSON.parse(fallback);
  }
}

export async function draftEmailReply(email, lead, company) {
  const companyName = company.name || 'Our team';
  const value = company.valueProposition || company.description || formatWebsiteContext(company);
  const fallback = `Hi ${lead.contactName || 'there'},\n\nThanks for reaching out. Based on your note, ${value || 'we need to complete the company profile before sending a detailed response'}.\n\nWould you be open to a short call this week?\n\nBest,\n${companyName}`;
  const prompt = `Draft a concise, helpful sales email reply. Do not invent commitments.

Company: ${company.name}
Company description: ${company.description}
Company value proposition: ${company.valueProposition || ''}
Preferred tone: ${company.tone || 'professional'}
Website intelligence for email context:
${formatWebsiteContext(company)}
Lead: ${JSON.stringify(lead)}
Original email subject: ${email.subject}
Original email body: ${email.body}`;

  return generateWithPaperclip(prompt, fallback, 'draft-email-reply');
}

export async function generateLeadBrief(leads, approvals, company) {
  const fallback = {
    summary: `${company.name} has ${leads.length} active lead${leads.length === 1 ? '' : 's'} and ${approvals.filter((item) => item.status === 'pending').length} pending approval${approvals.filter((item) => item.status === 'pending').length === 1 ? '' : 's'}.`,
    priorities: leads.slice(0, 3).map((lead) => ({
      leadId: lead.id,
      title: `${lead.companyName}: ${lead.interest}`,
      action: lead.nextAction || 'Review the latest conversation and approve the reply.'
    })),
    risks: approvals.filter((item) => item.status === 'pending').length
      ? ['Pending replies should be reviewed before lead interest cools.']
      : ['No immediate approval risks detected.']
  };

  const prompt = `Return only valid JSON for a CRM manager briefing.
Company: ${company.name} - ${company.description}
Leads: ${JSON.stringify(leads)}
Approvals: ${JSON.stringify(approvals)}

Schema:
{"summary":"","priorities":[{"leadId":"","title":"","action":""}],"risks":[""]}`;

  return parseJson(await generateWithPaperclip(prompt, JSON.stringify(fallback), 'lead-brief'), fallback);
}

export async function generateNextBestAction(lead, company, products) {
  const productName = getPrimaryProductName(products);
  const fallback = {
    action: lead.nextAction || 'Send a concise qualification reply and ask for a meeting.',
    rationale: `The lead is interested in ${lead.interest || productName || company.valueProposition || 'the company offering'} and is in ${lead.stage || 'New'} stage.`,
    emailAngle: 'Acknowledge their need, connect it to one product outcome, and propose a short call.'
  };

  const prompt = `Return only valid JSON with the next best sales action.
Company: ${company.name}
Products: ${JSON.stringify(products)}
Lead: ${JSON.stringify(lead)}

Schema:
{"action":"","rationale":"","emailAngle":""}`;

  return parseJson(await generateWithPaperclip(prompt, JSON.stringify(fallback), 'next-best-action'), fallback);
}

export async function generateCampaignDraft(company, products, leads) {
  const topProduct = getPrimaryProductName(products);
  const fallback = {
    subject: topProduct ? `A practical next step with ${topProduct}` : `A quick introduction from ${company.name || 'our team'}`,
    body: `Hi {{firstName}},\n\n${buildCompanyMessage(company, products)}\n\nWould a short walkthrough be useful this week?\n\nBest,\n${company.name || 'Our team'}`,
    audience: leads.slice(0, 5).map((lead) => lead.id),
    goal: 'Convert recent Gmail inquiries into discovery calls.'
  };

  const prompt = `Return only valid JSON for a small sales nurture campaign.
Company: ${company.name} - ${company.description}
Website intelligence: ${formatWebsiteContext(company)}
Products: ${JSON.stringify(products)}
Leads: ${JSON.stringify(leads)}

Schema:
{"subject":"","body":"","audience":["lead_id"],"goal":""}`;

  return parseJson(await generateWithPaperclip(prompt, JSON.stringify(fallback), 'campaign-draft'), fallback);
}

export async function generateMarketingEmailDraft({ company, products, leads, template, goal }) {
  const topProduct = getPrimaryProductName(products);
  const fallback = {
    subject: template?.subject || (topProduct ? `A practical next step with ${topProduct}` : `A quick introduction from ${company.name || 'our team'}`),
    body: template?.body || `Hi {{firstName}},\n\n${buildCompanyMessage(company, products)}\n\nWould you be open to a short walkthrough this week?\n\nBest,\n${company.name || 'Our team'}`,
    rationale: `Drafted for ${leads.length} selected lead${leads.length === 1 ? '' : 's'} using ${template?.name || 'a general'} template.`,
    personalizationFields: ['firstName', 'companyName', 'productName', 'interest']
  };

  const prompt = `You are an AI sales agent with access to approved email templates. Return only valid JSON.
Goal: ${goal || 'Create a concise marketing email for selected leads'}
Company: ${company.name} - ${company.description}
Target audience: ${company.targetAudience || ''}
Value proposition: ${company.valueProposition || ''}
Preferred tone: ${company.tone || 'professional'}
Website intelligence for messaging: ${formatWebsiteContext(company)}
Products: ${JSON.stringify(products)}
Selected leads: ${JSON.stringify(leads)}
Template available to agent: ${JSON.stringify(template)}

Use placeholders when useful: {{firstName}}, {{companyName}}, {{productName}}, {{interest}}.
Keep the email truthful, concise, and suitable for human approval before queue sending.

Schema:
{"subject":"","body":"","rationale":"","personalizationFields":[""]}`;

  return parseJson(await generateWithPaperclip(prompt, JSON.stringify(fallback), 'marketing-email-draft'), fallback);
}

export async function generateBuyerLeads({ company, products, count = 8, region = '', buyerType = '', webCandidates = [] }) {
  const topProduct = getPrimaryProductName(products);
  const fallback = {
    leads: webCandidates.slice(0, Math.min(Number(count) || 8, 25)).map((candidate) => ({
      companyName: candidate.companyName,
      address: candidate.address || region || 'Address not found on public page',
      email: candidate.email,
      website: candidate.website || candidate.sourceUrl,
      fitReason: `Web result appears relevant for ${topProduct || company.valueProposition || company.description || 'the company profile'}. ${candidate.snippet || candidate.siteSummary || ''}`.trim(),
      interest: topProduct || company.valueProposition || company.industry || 'Company profile match',
      score: candidate.emailFoundOnPage ? 78 : 62,
      verificationStatus: candidate.emailFoundOnPage ? 'web_email_found' : 'domain_email_suggested'
    }))
  };

  const prompt = `Return only valid JSON. Convert these real web search candidates into buyer prospect leads.
Do not invent companies. Use only companies from webCandidates. You may clean company names and summarize fit.
Emails are unverified unless webCandidates.emailFoundOnPage is true.

Company: ${JSON.stringify(company)}
Products: ${JSON.stringify(products)}
Website intelligence: ${formatWebsiteContext(company)}
Preferred buyer type: ${buyerType || company.targetAudience || 'best-fit buyers'}
Preferred region/address area: ${region || company.address || 'any relevant market'}
Number of buyer leads: ${Math.min(Number(count) || 8, 25)}
webCandidates: ${JSON.stringify(webCandidates)}

Each lead must include company name, address, and email id format.
Do not output placeholder companies.

Schema:
{"leads":[{"companyName":"","address":"","email":"","website":"","fitReason":"","interest":"","score":0,"verificationStatus":"web_email_found|domain_email_suggested|unverified"}]}`;

  return parseJson(await generateWithPaperclip(prompt, JSON.stringify(fallback), 'qualify-web-buyers'), fallback);
}

export async function generateBuyerIntroEmail({ company, products, buyerLead, template, goal }) {
  const topProduct = getPrimaryProductName(products) || buyerLead.interest || company.valueProposition || company.description;
  const fallback = {
    subject: `Intro: ${company.name || 'our team'} for ${buyerLead.companyName}`,
    body: `Hi there,\n\nI am reaching out from ${company.name || 'our team'}. ${buildCompanyMessage(company, products)}\n\nWould you be open to a short introduction this week?\n\nBest,\n${company.name || 'Our team'}`
  };

  const prompt = `Return only valid JSON. Draft a concise introductory B2B email for an AI-generated buyer prospect.
Do not mention private data or claim that the buyer requested contact.

Company: ${JSON.stringify(company)}
Products: ${JSON.stringify(products)}
Website intelligence: ${formatWebsiteContext(company)}
Buyer lead: ${JSON.stringify(buyerLead)}
Approved template: ${JSON.stringify(template)}
Goal: ${goal || 'Introduce the company and ask for a short call'}

Schema:
{"subject":"","body":""}`;

  return parseJson(await generateWithPaperclip(prompt, JSON.stringify(fallback), 'buyer-intro-email'), fallback);
}

export async function summarizeWebsiteForEmail({ company, websiteData }) {
  const fallback = {
    sourceUrl: websiteData.url,
    title: websiteData.title,
    summary: websiteData.description || websiteData.text.slice(0, 500),
    keyMessages: websiteData.headings.slice(0, 6),
    suggestedAngles: [
      company.valueProposition || 'Lead with the company value proposition.',
      'Use concise, relevant proof points from the website.'
    ],
    updatedAt: new Date().toISOString()
  };

  const prompt = `Return only valid JSON. Summarize this company website for CRM email communication.
Company profile: ${JSON.stringify(company)}
Website URL: ${websiteData.url}
Title: ${websiteData.title}
Meta description: ${websiteData.description}
Headings: ${JSON.stringify(websiteData.headings)}
Visible text: ${websiteData.text.slice(0, 8000)}

Schema:
{"sourceUrl":"","title":"","summary":"","keyMessages":[""],"suggestedAngles":[""],"updatedAt":""}`;

  return parseJson(await generateWithPaperclip(prompt, JSON.stringify(fallback), 'website-email-intelligence'), fallback);
}

function formatWebsiteContext(company) {
  const insights = company.websiteInsights || {};
  const messages = Array.isArray(insights.keyMessages) ? insights.keyMessages.join('; ') : '';
  const angles = Array.isArray(insights.suggestedAngles) ? insights.suggestedAngles.join('; ') : '';
  return [
    insights.summary,
    messages ? `Key messages: ${messages}` : '',
    angles ? `Suggested email angles: ${angles}` : ''
  ].filter(Boolean).join('\n') || 'No website intelligence gathered yet.';
}

function getPrimaryProductName(products) {
  return products.find((product) => product.name)?.name || '';
}

function buildCompanyMessage(company, products) {
  const product = products.find((item) => item.name || item.description);
  const productText = product ? `${product.name}${product.description ? `: ${product.description}` : ''}` : '';
  const message = company.valueProposition || company.description || productText || company.websiteInsights?.summary;
  return message || 'The company profile and website intelligence should be completed before sending detailed outreach.';
}

function parseJson(raw, fallback) {
  try {
    return JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] || raw);
  } catch {
    return fallback;
  }
}

function buildAgentTask(prompt) {
  return `You are the dedicated Hermes agent for an AI CRM. Complete this request through the Hermes runtime configured for this Paperclip agent.

Rules:
- Use only the company, website, product, lead, and email facts supplied below.
- Do not invent companies, contacts, email addresses, claims, or product capabilities.
- Follow the requested output schema exactly.
- Put the final answer in one issue comment beginning with ${RESULT_MARKER}
- After posting that comment, mark this issue done.
- Do not wrap the result in markdown fences.

REQUEST
${prompt}`;
}

async function waitForAgentResult(issueId) {
  const deadline = Date.now() + PAPERCLIP_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const [issue, comments] = await Promise.all([
      paperclipRequest(`/api/issues/${issueId}`),
      paperclipRequest(`/api/issues/${issueId}/comments`)
    ]);
    const result = findAgentResult(comments);
    if (result) return result;

    if (['cancelled', 'blocked'].includes(issue.status)) {
      throw new Error(`Paperclip issue ended with status ${issue.status}`);
    }
    if (issue.status === 'done') {
      throw new Error('Paperclip agent completed without an AI_CRM_RESULT comment');
    }

    await sleep(PAPERCLIP_POLL_INTERVAL_MS);
  }

  throw new Error(`Paperclip issue ${issueId} timed out after ${PAPERCLIP_TIMEOUT_MS}ms`);
}

function findAgentResult(comments) {
  if (!Array.isArray(comments)) return '';
  for (const comment of [...comments].reverse()) {
    const body = String(comment.body || comment.content || '');
    const markerIndex = body.indexOf(RESULT_MARKER);
    if (markerIndex >= 0) {
      return body.slice(markerIndex + RESULT_MARKER.length).trim();
    }
  }
  return '';
}

async function paperclipRequest(path, { method = 'GET', body, headers = {} } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.min(PAPERCLIP_TIMEOUT_MS, 30000));
  try {
    const response = await fetch(`${PAPERCLIP_BASE_URL}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${PAPERCLIP_API_KEY}`,
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...headers
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal
    });
    const text = await response.text();
    const data = text ? safeJson(text) : {};
    if (!response.ok) {
      throw new Error(data.error || data.message || `Paperclip returned ${response.status}`);
    }
    return data;
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
