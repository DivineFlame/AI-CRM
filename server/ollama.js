const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.1';

export async function getOllamaStatus() {
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`);
    if (!response.ok) throw new Error(`Ollama returned ${response.status}`);
    const data = await response.json();
    return {
      online: true,
      model: OLLAMA_MODEL,
      models: data.models?.map((model) => model.name) || []
    };
  } catch (error) {
    return {
      online: false,
      model: OLLAMA_MODEL,
      models: [],
      error: error.message
    };
  }
}

export async function generateWithOllama(prompt, fallback) {
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt,
        stream: false,
        options: { temperature: 0.35 }
      })
    });

    if (!response.ok) throw new Error(`Ollama returned ${response.status}`);
    const data = await response.json();
    return data.response?.trim() || fallback;
  } catch {
    return fallback;
  }
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

  const raw = await generateWithOllama(prompt, fallback);
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

  return generateWithOllama(prompt, fallback);
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

  return parseJson(await generateWithOllama(prompt, JSON.stringify(fallback)), fallback);
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

  return parseJson(await generateWithOllama(prompt, JSON.stringify(fallback)), fallback);
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

  return parseJson(await generateWithOllama(prompt, JSON.stringify(fallback)), fallback);
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

  return parseJson(await generateWithOllama(prompt, JSON.stringify(fallback)), fallback);
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

  return parseJson(await generateWithOllama(prompt, JSON.stringify(fallback)), fallback);
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

  return parseJson(await generateWithOllama(prompt, JSON.stringify(fallback)), fallback);
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

  return parseJson(await generateWithOllama(prompt, JSON.stringify(fallback)), fallback);
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
