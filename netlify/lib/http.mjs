// Small HTTP helpers shared by all functions.

export function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });
}

export function redirect(location, headers = {}) {
  return new Response(null, { status: 303, headers: { location, 'cache-control': 'no-store', ...headers } });
}

/** Reads a JSON or form-encoded body, with a size limit. */
export async function readBody(req, limit = 30000) {
  const type = req.headers.get('content-type') || '';
  const text = await req.text();
  if (text.length > limit) throw httpError(413, 'That request is too large.');
  if (type.includes('application/json')) {
    try { return { data: JSON.parse(text || '{}'), form: false }; }
    catch { throw httpError(400, 'The request could not be read.'); }
  }
  if (type.includes('application/x-www-form-urlencoded')) {
    return { data: Object.fromEntries(new URLSearchParams(text)), form: true };
  }
  return { data: {}, form: false };
}

/** Blocks cross-site browser requests to state-changing endpoints. */
export function sameOrigin(req) {
  const site = req.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin' && site !== 'none') return false;
  const origin = req.headers.get('origin');
  if (origin) {
    try { return new URL(origin).host === new URL(req.url).host; } catch { return false; }
  }
  return true;
}

export function parseCookies(req) {
  const out = {};
  (req.headers.get('cookie') || '').split(';').forEach((p) => {
    const i = p.indexOf('=');
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}

export function sessionCookie(req, value, maxAgeSeconds) {
  const secure = new URL(req.url).protocol === 'https:' ? '; Secure' : '';
  return `bm_session=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSeconds}${secure}`;
}

export function clientIp(req, context) {
  return (context && context.ip) ||
    req.headers.get('x-nf-client-connection-ip') ||
    (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() ||
    'unknown';
}

/** Wraps a handler so thrown errors become clean JSON responses. */
export function wrap(handler) {
  return async (req, context) => {
    try {
      return await handler(req, context);
    } catch (e) {
      if (e && e.status) return json({ error: e.message }, e.status);
      console.error(e);
      return json({ error: 'Something went wrong on our side. Please try again.' }, 500);
    }
  };
}

/** Returns the last path segments after /api/, e.g. "admin/staff" => ["admin","staff"]. */
export function route(req) {
  const p = new URL(req.url).pathname;
  const i = p.indexOf('/api/');
  return i < 0 ? [] : p.slice(i + 5).split('/').filter(Boolean);
}

export function csvCell(v) {
  let s = String(v == null ? '' : v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // stop spreadsheet formula injection
  return '"' + s.replace(/"/g, '""') + '"';
}
