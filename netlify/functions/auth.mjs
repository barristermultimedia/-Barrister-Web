// /api/login  /api/logout  /api/session  /api/password
import { wrap, json, readBody, sameOrigin, httpError, route, clientIp, sessionCookie } from '../lib/http.mjs';
import { store } from '../lib/store.mjs';
import {
  hashPassword, verifyPassword, fakeVerify, safeEqual, signSession, getSession, getSettings,
  rateLimit, clearRateLimit, ipKey, requireRole, SESSION_SECONDS,
} from '../lib/auth.mjs';

const clip = (v, n) => String(v == null ? '' : v).trim().slice(0, n);

export default wrap(async (req, context) => {
  const [action] = route(req);

  if (action === 'session') {
    const s = await getSession(req);
    return json({ user: s ? { role: s.role, name: s.name, username: s.username } : null });
  }

  if (req.method !== 'POST') throw httpError(405, 'Method not allowed.');
  if (!sameOrigin(req)) throw httpError(403, 'Forbidden.');
  const { data } = await readBody(req);

  if (action === 'logout') {
    return json({ ok: true }, 200, { 'set-cookie': sessionCookie(req, '', 0) });
  }

  if (action === 'login') {
    const username = clip(data.username, 64).toLowerCase();
    const password = String(data.password || '').slice(0, 200);
    if (!username || !password) throw httpError(400, 'Enter your username and password.');
    const limitKey = ipKey('login', clientIp(req, context));
    await rateLimit(limitKey, 12, 15 * 60 * 1000, 'Too many sign-in attempts. Please wait 15 minutes and try again.');
    const settings = await getSettings();
    const fail = () => { throw httpError(401, 'That username or password is not right.'); };

    const adminName = (process.env.ADMIN_USERNAME || 'admin').toLowerCase();
    if (username === adminName) {
      if (!process.env.ADMIN_PASSWORD) throw httpError(503, 'Admin sign-in is not set up yet. Add ADMIN_PASSWORD in Netlify.');
      if (!safeEqual(password, process.env.ADMIN_PASSWORD)) fail();
      await clearRateLimit(limitKey);
      const token = signSession({ role: 'admin', sub: adminName, v: settings.sessionVersion });
      return json({ ok: true, role: 'admin', name: 'Administrator', redirect: 'admin.html' }, 200, { 'set-cookie': sessionCookie(req, token, SESSION_SECONDS) });
    }

    const staff = await store('staff').get(username);
    if (!staff) { fakeVerify(password); fail(); }
    if (!verifyPassword(password, staff.salt, staff.hash)) fail();
    if (!staff.active) throw httpError(403, 'This account is switched off. Please contact the studio manager.');
    await clearRateLimit(limitKey);
    const token = signSession({ role: 'staff', sub: staff.username, v: settings.sessionVersion });
    return json({ ok: true, role: 'staff', name: staff.name, redirect: 'attendance.html' }, 200, { 'set-cookie': sessionCookie(req, token, SESSION_SECONDS) });
  }

  if (action === 'password') {
    const me = await requireRole(req, 'staff');
    const current = String(data.current || ''), next = String(data.next || '');
    if (next.length < 8 || next.length > 200) throw httpError(400, 'Use a new password of at least 8 characters.');
    const staff = await store('staff').get(me.username);
    if (!staff || !verifyPassword(current, staff.salt, staff.hash)) throw httpError(401, 'Your current password is not right.');
    const { salt, hash } = hashPassword(next);
    await store('staff').set(staff.username, { ...staff, salt, hash });
    return json({ ok: true });
  }

  throw httpError(404, 'Not found.');
});

export const config = { path: ['/api/login', '/api/logout', '/api/session', '/api/password'] };
