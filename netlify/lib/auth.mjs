// Passwords, signed session cookies, settings and rate limiting.
import crypto from 'node:crypto';
import { httpError, parseCookies } from './http.mjs';
import { store } from './store.mjs';

const SESSION_SECONDS = 60 * 60 * 12; // 12 hours
export { SESSION_SECONDS };

export function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  return { salt, hash: crypto.scryptSync(password, salt, 32).toString('hex') };
}

export function verifyPassword(password, salt, hash) {
  const a = crypto.scryptSync(password, salt, 32);
  const b = Buffer.from(hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const DUMMY = hashPassword('not-a-real-password');
/** Spends the same time as a real check, so unknown usernames are not revealed by timing. */
export function fakeVerify(password) { verifyPassword(password, DUMMY.salt, DUMMY.hash); }

export function safeEqual(a, b) {
  const x = crypto.createHash('sha256').update(String(a)).digest();
  const y = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
}

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) throw httpError(500, 'The server is not set up yet: SESSION_SECRET is missing.');
  return s;
}
const b64u = (s) => Buffer.from(s).toString('base64url');
const hmac = (body) => crypto.createHmac('sha256', secret()).update(body).digest('base64url');

export function signSession(payload) {
  const body = b64u(JSON.stringify({ ...payload, exp: Date.now() + SESSION_SECONDS * 1000 }));
  return `${body}.${hmac(body)}`;
}

function readToken(token) {
  if (!token || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  const good = hmac(body);
  if (sig.length !== good.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good))) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    return p.exp > Date.now() ? p : null;
  } catch { return null; }
}

export async function getSettings() {
  const saved = (await store('config').get('settings')) || {};
  return {
    name: 'Barrister Multimedia studio',
    lat: null, lng: null, radius: 100, mode: 'flag',
    timezone: process.env.TIMEZONE || 'UTC',
    sessionVersion: 1,
    ...saved,
  };
}

export async function saveSettings(patch) {
  const next = { ...(await getSettings()), ...patch };
  await store('config').set('settings', next);
  return next;
}

/** Returns the signed-in user, or null. Staff are re-checked against storage on every request. */
export async function getSession(req) {
  const p = readToken(parseCookies(req).bm_session);
  if (!p) return null;
  const settings = await getSettings();
  if (p.v !== settings.sessionVersion) return null;
  if (p.role === 'admin') return { role: 'admin', username: p.sub, name: 'Administrator' };
  const s = await store('staff').get(p.sub);
  if (!s || !s.active) return null;
  return { role: 'staff', username: s.username, name: s.name, jobRole: s.role };
}

export async function requireRole(req, role) {
  const s = await getSession(req);
  if (!s) throw httpError(401, 'Please sign in.');
  if (role && s.role !== role) throw httpError(403, 'You do not have access to this.');
  return s;
}

/** Simple fixed-window limiter stored with the other data. Throws 429 when exceeded. */
export async function rateLimit(key, max, windowMs, message = 'Too many attempts. Please wait a while and try again.') {
  const db = store('ratelimit');
  const now = Date.now();
  let r = await db.get(key);
  if (!r || r.reset < now) r = { count: 0, reset: now + windowMs };
  r.count += 1;
  await db.set(key, r);
  if (r.count > max) throw httpError(429, message);
}

export async function clearRateLimit(key) { await store('ratelimit').delete(key); }

export function ipKey(prefix, ip) {
  return prefix + ':' + crypto.createHash('sha256').update(String(ip)).digest('hex').slice(0, 24);
}
