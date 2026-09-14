/* ============================================================
   link-preview — a small server that reads a web page for you.

   Why this exists: your browser refuses to let VALORG read another
   website's HTML. This code doesn't run in a browser — it runs on
   Supabase's servers, where that rule doesn't apply. It fetches the page,
   pulls out the preview tags most sites publish, and hands back tidy JSON.

   Most sites describe themselves in <meta> tags for exactly this purpose,
   so links look right when shared. That's what we're reading.
   ============================================================ */

// Browsers demand permission before letting a page call another origin.
// These headers grant it. The function still requires a valid login below,
// so this isn't opening anything up.
//
// Note on auth: Supabase can check the login for you, before your code runs.
// We don't use that here, because browsers never attach an Authorization
// header to the permission-check request they send first — so that check
// rejects it, your code never runs, and these headers never get sent. The
// browser then refuses the real request. Instead we check the login
// ourselves, below, *after* answering the permission check.
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });

/* ---------- Safety ----------

   This function fetches whatever URL it's handed. Left unguarded, someone
   could point it at addresses only reachable from inside the server — a
   classic way to make a helpful service leak things it shouldn't. Only you
   can call this (it requires a login), but guarding it is the habit worth
   having. */

const BLOCKED = [
  /^localhost$/i,
  /\.local$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^169\.254\./,          // includes cloud metadata at 169.254.169.254
  /^\[?::1\]?$/,
  /^0\.0\.0\.0$/,
];

function checkUrl(raw: string): { url: URL } | { error: string } {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { error: "That doesn't look like a web address." };
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { error: 'Only http and https links can be previewed.' };
  }
  if (BLOCKED.some(rx => rx.test(url.hostname))) {
    return { error: 'That address is not allowed.' };
  }
  return { url };
}

/* ---------- Reading the page ---------- */

/** Pull the content of a <meta> tag, whichever way round its attributes sit. */
function meta(html: string, name: string): string {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]*content=["']([^"']*)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${escaped}["']`, 'i'),
  ];
  for (const rx of patterns) {
    const hit = html.match(rx);
    if (hit?.[1]) return decode(hit[1].trim());
  }
  return '';
}

/** Turn &amp; and friends back into real characters. */
function decode(s: string): string {
  const named: Record<string, string> = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'", '#x27': "'",
  };
  return s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, code) => {
    const key = String(code).toLowerCase();
    if (named[key]) return named[key];
    if (key.startsWith('#x')) return String.fromCodePoint(parseInt(key.slice(2), 16));
    if (key.startsWith('#'))  return String.fromCodePoint(parseInt(key.slice(1), 10));
    return whole;
  });
}

/** Relative image paths ("/img/x.jpg") need the site's address bolted on. */
function absolute(src: string, base: URL): string {
  if (!src) return '';
  try { return new URL(src, base).href; } catch { return ''; }
}

/** Is whoever called this actually signed in? */
async function signedIn(req: Request): Promise<boolean> {
  const auth = req.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return false;

  // Ask Supabase who this token belongs to. A bad or expired token fails here.
  const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/auth/v1/user`, {
    headers: { Authorization: auth, apikey: Deno.env.get('SUPABASE_ANON_KEY') ?? '' },
  });
  return res.ok;
}

Deno.serve(async req => {
  // The permission check comes first, and must be answered without auth.
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST')    return json({ error: 'Send a POST.' }, 405);

  if (!await signedIn(req)) return json({ error: 'Sign in first.' }, 401);

  let body: { url?: string };
  try { body = await req.json(); } catch { return json({ error: 'Expected JSON.' }, 400); }

  const checked = checkUrl(String(body.url ?? '').trim());
  if ('error' in checked) return json({ error: checked.error }, 400);
  const { url } = checked;

  let res: Response;
  try {
    res = await fetch(url.href, {
      redirect: 'follow',
      signal: AbortSignal.timeout(8000),   // don't hang forever on a slow site
      headers: {
        // Some sites serve nothing useful to unfamiliar clients.
        'User-Agent': 'Mozilla/5.0 (compatible; VALORG link preview)',
        'Accept': 'text/html,application/xhtml+xml',
      },
    });
  } catch (e) {
    const timedOut = e instanceof Error && e.name === 'TimeoutError';
    return json({ error: timedOut ? 'That site took too long to answer.' : "Couldn't reach that site." }, 502);
  }

  if (!res.ok) return json({ error: `That site answered with ${res.status}.` }, 502);

  const type = res.headers.get('content-type') ?? '';
  if (!type.includes('html')) {
    // A direct link to an image is still perfectly useful.
    if (type.startsWith('image/')) {
      return json({ url: res.url, title: url.hostname, image: res.url, site: url.hostname, price: '', currency: '', description: '' });
    }
    return json({ error: 'That link is not a web page.' }, 415);
  }

  // Read a capped amount — the tags we want live in <head>, near the top.
  const html = (await res.text()).slice(0, 600_000);
  const finalUrl = new URL(res.url);

  const title =
    meta(html, 'og:title') ||
    meta(html, 'twitter:title') ||
    decode(html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() ?? '') ||
    finalUrl.hostname;

  const image = absolute(
    meta(html, 'og:image:secure_url') || meta(html, 'og:image') || meta(html, 'twitter:image'),
    finalUrl
  );

  const price =
    meta(html, 'product:price:amount') ||
    meta(html, 'og:price:amount') ||
    meta(html, 'twitter:data1') ||
    '';

  return json({
    url:         res.url,
    title,
    image,
    site:        meta(html, 'og:site_name') || finalUrl.hostname.replace(/^www\./, ''),
    description: meta(html, 'og:description') || meta(html, 'description') || '',
    price:       /[\d]/.test(price) ? price.replace(/[^\d.,]/g, '') : '',
    currency:    meta(html, 'product:price:currency') || meta(html, 'og:price:currency') || '',
  });
});
