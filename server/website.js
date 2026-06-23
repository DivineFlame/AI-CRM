import { lookup } from 'node:dns/promises';
import net from 'node:net';

const MAX_TEXT = 12000;

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

  return { url, title, description, headings, text };
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
