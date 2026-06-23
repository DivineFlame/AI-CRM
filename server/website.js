import { lookup } from 'node:dns/promises';
import net from 'node:net';

const MAX_TEXT = 12000;
const SEARCH_RESULT_LIMIT = 12;

export async function gatherWebsiteData(inputUrl) {
  const url = normalizeUrl(inputUrl);
  await assertPublicUrl(url);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'AI-CRM/1.0 website context fetcher',
        Accept: 'text/html,application/xhtml+xml'
      }
    });
    if (!response.ok) throw new Error(`Website returned ${response.status}`);
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) throw new Error('Website did not return HTML content');
    const html = await response.text();
    return extractWebsiteData(url.href, html);
  } finally {
    clearTimeout(timeout);
  }
}

export async function searchBuyerCompanies({ company, products, count = 8, region = '', buyerType = '' }) {
  const productTerms = products.map((product) => product.category || product.name).filter(Boolean).slice(0, 3).join(' ');
  const query = [
    buyerType || company.targetAudience || company.industry,
    region || company.address,
    productTerms,
    'company contact email'
  ].filter(Boolean).join(' ');

  const resultLimit = Math.max(Number(count) || 8, SEARCH_RESULT_LIMIT);
  let results = await searchBing(query, resultLimit);
  if (!results.length) {
    results = await searchDuckDuckGo(query, resultLimit);
  }
  const candidates = [];

  for (const result of results.slice(0, SEARCH_RESULT_LIMIT)) {
    const candidate = {
      companyName: cleanCompanyName(result.title),
      website: result.url,
      address: region || '',
      email: emailFromText(`${result.title} ${result.snippet}`) || emailFromDomain(result.url),
      snippet: result.snippet,
      sourceUrl: result.url,
      emailFoundOnPage: false
    };

    try {
      const site = await gatherWebsiteData(result.url);
      candidate.companyName = cleanCompanyName(site.title || candidate.companyName);
      candidate.email = site.emails[0] || candidate.email;
      candidate.address = site.addressCandidates[0] || candidate.address || result.snippet;
      candidate.siteSummary = site.description || site.headings.slice(0, 3).join(' ') || site.text.slice(0, 300);
      candidate.emailFoundOnPage = Boolean(site.emails[0]);
    } catch {
      candidate.address = candidate.address || result.snippet;
    }

    candidates.push(candidate);
  }

  return { query, candidates };
}

function normalizeUrl(inputUrl) {
  const value = String(inputUrl || '').trim();
  if (!value) throw new Error('Company website is required');
  const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  const url = new URL(withProtocol);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only HTTP and HTTPS websites are supported');
  return url;
}

async function assertPublicUrl(url) {
  const host = url.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost')) throw new Error('Localhost websites are not allowed');
  if (net.isIP(host) && isPrivateIp(host)) throw new Error('Private network websites are not allowed');

  const addresses = await lookup(host, { all: true }).catch(() => []);
  if (addresses.some((item) => isPrivateIp(item.address))) {
    throw new Error('Private network websites are not allowed');
  }
}

function isPrivateIp(address) {
  if (address === '::1') return true;
  if (address.startsWith('fc') || address.startsWith('fd') || address.startsWith('fe80')) return true;
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) return false;
  return (
    parts[0] === 10 ||
    parts[0] === 127 ||
    (parts[0] === 169 && parts[1] === 254) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168)
  );
}

function extractWebsiteData(url, html) {
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ');

  const title = decode(matchFirst(cleaned, /<title[^>]*>([\s\S]*?)<\/title>/i));
  const description = decode(
    matchFirst(cleaned, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["'][^>]*>/i) ||
    matchFirst(cleaned, /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["'][^>]*>/i)
  );
  const headings = [...cleaned.matchAll(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi)]
    .map((match) => decode(stripTags(match[1])))
    .filter(Boolean)
    .slice(0, 18);
  const text = decode(stripTags(cleaned))
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_TEXT);
  const emails = [...new Set(text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [])].slice(0, 5);
  const addressCandidates = extractAddressCandidates(text);

  return { url, title, description, headings, text, emails, addressCandidates };
}

async function searchDuckDuckGo(query, count) {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'AI-CRM/1.0 web lead search',
      Accept: 'text/html'
    }
  });
  if (!response.ok) throw new Error(`Web search returned ${response.status}`);
  const html = await response.text();
  const results = [];
  const matches = html.matchAll(/<a[^>]+class=["'][^"']*result__a[^"']*["'][^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]+class=["'][^"']*result__snippet[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi);
  for (const match of matches) {
    const resultUrl = unwrapDuckDuckGoUrl(decode(match[1]));
    if (!resultUrl || !/^https?:\/\//i.test(resultUrl)) continue;
    results.push({
      title: decode(stripTags(match[2])),
      url: resultUrl,
      snippet: decode(stripTags(match[3]))
    });
    if (results.length >= count) break;
  }
  return dedupeResults(results).filter(isProspectResult);
}

async function searchBing(query, count) {
  const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}`;
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; AI-CRM/1.0; +https://example.com/bot)',
      Accept: 'text/html'
    }
  });
  if (!response.ok) return [];
  const html = await response.text();
  const results = [];
  const matches = html.matchAll(/<li class="b_algo"[\s\S]*?<h2[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:<p[^>]*>([\s\S]*?)<\/p>)?/gi);
  for (const match of matches) {
    const resultUrl = unwrapBingUrl(decode(match[1]));
    if (!resultUrl || !/^https?:\/\//i.test(resultUrl)) continue;
    results.push({
      title: decode(stripTags(match[2])),
      url: resultUrl,
      snippet: decode(stripTags(match[3] || ''))
    });
    if (results.length >= count) break;
  }
  return dedupeResults(results).filter(isProspectResult);
}

function isProspectResult(result) {
  const text = `${result.title} ${result.url} ${result.snippet}`.toLowerCase();
  if (/\b(login|sign in|what is|definition|guide|blog|article|pricing|support|docs|documentation|careers|job|dictionary|encyclopedia|investopedia|wikipedia)\b/.test(text)) {
    return false;
  }
  try {
    const url = new URL(result.url);
    if (/\b(login|blog|article|support|docs|careers|jobs|terms|wiki)\b/.test(url.pathname.toLowerCase())) return false;
    return true;
  } catch {
    return false;
  }
}

function unwrapBingUrl(value) {
  try {
    const url = new URL(value);
    const nested = url.searchParams.get('u');
    if (!nested) return value;
    const encoded = nested.startsWith('a1') ? nested.slice(2) : nested;
    const normalized = encoded.replace(/-/g, '+').replace(/_/g, '/');
    return Buffer.from(normalized, 'base64').toString('utf8') || value;
  } catch {
    return value;
  }
}

function unwrapDuckDuckGoUrl(value) {
  try {
    const url = new URL(value);
    const nested = url.searchParams.get('uddg');
    return nested ? decodeURIComponent(nested) : value;
  } catch {
    return value;
  }
}

function dedupeResults(results) {
  const seen = new Set();
  return results.filter((result) => {
    try {
      const host = new URL(result.url).hostname.replace(/^www\./, '');
      if (seen.has(host)) return false;
      seen.add(host);
      return true;
    } catch {
      return false;
    }
  });
}

function emailFromText(value) {
  return String(value || '').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || '';
}

function emailFromDomain(value) {
  try {
    const host = new URL(value).hostname.replace(/^www\./, '');
    return `contact@${host}`;
  } catch {
    return '';
  }
}

function cleanCompanyName(value) {
  return String(value || 'Unknown Company')
    .replace(/\s*[-|].*$/, '')
    .replace(/\b(home|official site|contact us)\b/gi, '')
    .trim() || 'Unknown Company';
}

function extractAddressCandidates(text) {
  const sentences = String(text || '').split(/(?<=[.!?])\s+/).filter(Boolean);
  return sentences
    .filter((sentence) => /\b(address|headquarters|located|office|road|street|avenue|suite|floor|india|usa|uk|canada|australia)\b/i.test(sentence))
    .map((sentence) => sentence.slice(0, 220).trim())
    .slice(0, 5);
}

function matchFirst(value, pattern) {
  return value.match(pattern)?.[1] || '';
}

function stripTags(value) {
  return value.replace(/<[^>]+>/g, ' ');
}

function decode(value) {
  return String(value || '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}
