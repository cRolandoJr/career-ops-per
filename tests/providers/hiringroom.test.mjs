// tests/providers/hiringroom.test.mjs — HiringRoom per-company HTML microsite provider.
import { pass, fail, ROOT } from '../helpers.mjs';
import { join } from 'path';
import { pathToFileURL } from 'url';

console.log('\nProvider — hiringroom');

try {
  const mod = await import(pathToFileURL(join(ROOT, 'providers/hiringroom.mjs')).href);
  const hiringroom = mod.default;
  const { parseHiringRoomJobs } = mod;

  if (hiringroom.id === 'hiringroom') pass('hiringroom.id is "hiringroom"');
  else fail(`hiringroom.id is ${JSON.stringify(hiringroom.id)}`);

  // detect(): claims *.hiringroom.com careers_url, rejects everything else.
  if (hiringroom.detect({ careers_url: 'https://growuphr.hiringroom.com/jobs' }))
    pass('hiringroom.detect() claims a *.hiringroom.com careers_url');
  else fail('hiringroom.detect() should claim a *.hiringroom.com careers_url');

  if (!hiringroom.detect({ careers_url: 'https://jobs.lever.co/acme' }))
    pass('hiringroom.detect() ignores a non-hiringroom careers_url');
  else fail('hiringroom.detect() should ignore a non-hiringroom careers_url');

  if (!hiringroom.detect({ careers_url: 'https://evil-hiringroom.com/jobs' }))
    pass('hiringroom.detect() rejects a look-alike host (evil-hiringroom.com)');
  else fail('hiringroom.detect() should reject a look-alike host');

  // A tiny fixture mirroring the live markup: two real cards (one with an HTML
  // entity + whitespace in the title), one apply link (dropped), one anchor
  // whose block has no title (dropped), and a duplicate of card 1 (deduped).
  const html = `
    <a href="/jobs/get_vacancy/aaa111" class="text-decoration-none">
      <div class="card p-3">
        <div class="card-vacancy">
          <h4 class="font-black fs-20 name__vacancy"> Senior Python Backend Engineer (USA) </h4>
          <p class="card-text"><span><i class="hr-Location-pin hrc-black"></i> Argentina </span></p>
        </div>
      </div>
    </a>
    <a href="/jobs/get_vacancy/bbb222" class="text-decoration-none">
      <div class="card p-3">
        <div class="card-vacancy">
          <h4 class="fs-20 name__vacancy"> Desarrollador Go &amp; Cloud </h4>
          <p class="card-text"><span><i class="hr-Location-pin hrc-black"></i> Remoto </span></p>
        </div>
      </div>
    </a>
    <a href="/jobs/get_vacancy/aaa111/candidates/new">Postularme</a>
    <a href="/jobs/get_vacancy/ccc333" class="text-decoration-none">
      <div class="card p-3"><div class="card-vacancy"><h5>No title here</h5></div></div>
    </a>
    <a href="/jobs/get_vacancy/aaa111" class="text-decoration-none">
      <div class="card p-3"><div class="card-vacancy"><h4 class="name__vacancy"> Senior Python Backend Engineer (USA) </h4></div></div>
    </a>`;

  const jobs = parseHiringRoomJobs(html, 'https://growuphr.hiringroom.com', 'Grow UP HR');

  if (jobs.length === 2)
    pass('parseHiringRoomJobs keeps 2 cards (drops apply link, title-less block, dedups repeat)');
  else fail(`parseHiringRoomJobs returned ${jobs.length} jobs (expected 2): ${JSON.stringify(jobs.map(j => j.url))}`);

  if (jobs[0] && Object.keys(jobs[0]).sort().join(',') === 'company,location,title,url')
    pass('parseHiringRoomJobs returns the normalized { title, url, company, location } shape');
  else fail(`parseHiringRoomJobs row 0 keys = ${JSON.stringify(jobs[0] && Object.keys(jobs[0]))}`);

  if (jobs[0]?.title === 'Senior Python Backend Engineer (USA)'
      && jobs[0]?.url === 'https://growuphr.hiringroom.com/jobs/get_vacancy/aaa111'
      && jobs[0]?.company === 'Grow UP HR'
      && jobs[0]?.location === 'Argentina')
    pass('parseHiringRoomJobs maps title/url/company/location and trims whitespace');
  else fail(`parseHiringRoomJobs row 0 = ${JSON.stringify(jobs[0])}`);

  if (jobs[1]?.title === 'Desarrollador Go & Cloud')
    pass('parseHiringRoomJobs decodes HTML entities in the title (&amp; → &)');
  else fail(`parseHiringRoomJobs row 1 title = ${JSON.stringify(jobs[1]?.title)}`);

  if (jobs[1]?.location === 'Remoto')
    pass('parseHiringRoomJobs extracts the location that follows the pin icon');
  else fail(`parseHiringRoomJobs row 1 location = ${JSON.stringify(jobs[1]?.location)}`);

  // fetch() drives ctx.fetchText with the pinned URL + SSRF guard, then parses.
  let capturedUrl = null;
  let capturedOpts = null;
  const fetched = await hiringroom.fetch(
    { name: 'Grow UP HR', careers_url: 'https://growuphr.hiringroom.com/jobs', provider: 'hiringroom' },
    { fetchText: async (url, opts) => { capturedUrl = url; capturedOpts = opts; return html; } },
  );
  if (capturedUrl === 'https://growuphr.hiringroom.com/jobs' && capturedOpts?.redirect === 'error')
    pass('hiringroom.fetch() fetches the careers_url with redirect:"error" (SSRF guard)');
  else fail(`hiringroom.fetch() requested ${JSON.stringify(capturedUrl)} opts=${JSON.stringify(capturedOpts)}`);

  if (fetched.length === 2 && fetched[0]?.company === 'Grow UP HR')
    pass('hiringroom.fetch() returns parsed jobs labelled with entry.name as company');
  else fail(`hiringroom.fetch() = ${JSON.stringify(fetched)}`);

  // SSRF: a non-hiringroom host must throw before any parse.
  let ssrfThrew = false;
  try {
    await hiringroom.fetch(
      { name: 'X', careers_url: 'https://evil.example.com/jobs' },
      { fetchText: async () => html },
    );
  } catch (e) {
    ssrfThrew = /untrusted hostname/.test(e.message);
  }
  if (ssrfThrew) pass('hiringroom.fetch() throws on an untrusted hostname');
  else fail('hiringroom.fetch() should throw on an untrusted hostname');

} catch (e) {
  fail(`hiringroom provider tests crashed: ${e.message}`);
}
