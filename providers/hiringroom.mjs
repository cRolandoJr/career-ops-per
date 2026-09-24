// @ts-check
/** @typedef {import('./_types.js').Provider} Provider */

import { decodeEntities } from './_html-entities.mjs';

// HiringRoom provider — a LATAM/AR applicant-tracking system used by many
// companies, each on its own `<company>.hiringroom.com` subdomain. There is no
// public JSON API: the /jobs microsite renders every vacancy server-side, so
// this provider fetches that HTML and parses the vacancy cards in-process
// (zero-token), the same block-regex approach as providers/nodesk.mjs.
//
// Per-company pattern (like greenhouse/lever): one portals.yml entry per
// employer, with `careers_url: https://<company>.hiringroom.com/jobs`. The
// company label is the entry's `name` — the card markup doesn't repeat it.

const TRUSTED_HOST = 'hiringroom.com';

/** @param {string} url */
function assertHiringRoomUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`hiringroom: invalid URL: ${url}`);
  }
  if (parsed.protocol !== 'https:') throw new Error(`hiringroom: URL must use HTTPS: ${url}`);
  const host = parsed.hostname.toLowerCase();
  if (host !== TRUSTED_HOST && !host.endsWith(`.${TRUSTED_HOST}`)) {
    throw new Error(`hiringroom: untrusted hostname "${parsed.hostname}" — must be ${TRUSTED_HOST} or a subdomain`);
  }
  return parsed;
}

/** @type {Provider} */
export default {
  id: 'hiringroom',

  detect(entry) {
    const url = entry?.careers_url || '';
    try {
      const host = new URL(url).hostname.toLowerCase();
      if (host === TRUSTED_HOST || host.endsWith(`.${TRUSTED_HOST}`)) return { url };
    } catch {
      /* not a URL — fall through */
    }
    return null;
  },

  async fetch(entry, ctx) {
    const listUrl = entry.careers_url || '';
    const parsed = assertHiringRoomUrl(listUrl);
    // redirect:'error' prevents SSRF via server-side redirects; combined with
    // assertHiringRoomUrl it keeps the request pinned to the hiringroom domain.
    const html = await ctx.fetchText(parsed.href, { redirect: 'error' });
    const company = typeof entry.name === 'string' && entry.name.trim() ? entry.name.trim() : 'HiringRoom';
    return parseHiringRoomJobs(html, parsed.origin, company);
  },
};

/**
 * Parse a HiringRoom /jobs microsite. Exported for unit tests.
 *
 * Each vacancy is an `<a href="/jobs/get_vacancy/<id>">` wrapping a card whose
 * `<h4 class="… name__vacancy">` holds the title and whose `.hr-Location-pin`
 * icon precedes the location text. Anchors to `…/candidates/new` (the apply
 * link) and blocks without a title are skipped; URLs are deduped.
 *
 * @param {string} html - raw microsite HTML
 * @param {string} origin - e.g. "https://growuphr.hiringroom.com", to absolutize hrefs
 * @param {string} company - fallback/label company (the portals.yml entry name)
 * @returns {Array<{title: string, url: string, company: string, location: string}>}
 */
export function parseHiringRoomJobs(html, origin, company = 'HiringRoom') {
  if (typeof html !== 'string') return [];
  const jobs = [];
  const seen = new Set();

  const anchorRe = /href="(\/jobs\/get_vacancy\/[a-f0-9]+)"/gi;
  const matches = [...html.matchAll(anchorRe)];

  for (let k = 0; k < matches.length; k++) {
    const href = matches[k][1];
    if (/\/candidates\//i.test(href)) continue;

    const start = matches[k].index ?? 0;
    const end = k + 1 < matches.length ? (matches[k + 1].index ?? html.length) : html.length;
    const block = html.slice(start, end);

    const titleM = block.match(/name__vacancy[^>]*>([\s\S]*?)<\/h4>/i);
    if (!titleM) continue;
    const title = decodeEntities(titleM[1].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
    if (!title) continue;

    const url = origin + href;
    if (seen.has(url)) continue;
    seen.add(url);

    const locM = block.match(/hr-Location-pin[^>]*><\/i>\s*([^<]+)/i);
    const location = locM ? decodeEntities(locM[1]).replace(/\s+/g, ' ').trim() : '';

    jobs.push({ title, url, company, location });
  }

  return jobs;
}
