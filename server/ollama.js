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
  const fallback = JSON.stringify({
    companyName: email.fromName || email.from?.split('@')[1] || 'Unknown',
    contactName: email.fromName || email.from,
    email: email.from,
    stage: 'New',
    score: 72,
    interest: products[0]?.name || 'General inquiry',
    summary: `Potential lead from email: ${email.subject}`,
    nextAction: 'Review and approve a personalized reply.'
  });

  const prompt = `You are a CRM lead analyst. Return only valid JSON.
Company profile:
${company.name} - ${company.description}

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
  const fallback = `Hi ${lead.contactName || 'there'},\n\nThanks for reaching out about ${lead.interest}. Based on your note, ${company.name} can help with a practical next step and a short walkthrough.\n\nWould you be open to a 20-minute call this week?\n\nBest,\n${company.name}`;
  const prompt = `Draft a concise, helpful sales email reply. Do not invent commitments.

Company: ${company.name}
Company description: ${company.description}
Lead: ${JSON.stringify(lead)}
Original email subject: ${email.subject}
Original email body: ${email.body}`;

  return generateWithOllama(prompt, fallback);
}
