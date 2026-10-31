// GET /api/attendance  and  POST /api/attendance  (signed-in staff only)
// The server decides in/out, takes the time from its own clock and checks the location.
import crypto from 'node:crypto';
import { wrap, json, readBody, sameOrigin, httpError } from '../lib/http.mjs';
import { store } from '../lib/store.mjs';
import { requireRole, getSettings } from '../lib/auth.mjs';
import { judge, dayKey } from '../lib/geo.mjs';

function monthsBack(now, tz, n) {
  const out = []; let [y, m] = dayKey(now, tz).slice(0, 7).split('-').map(Number);
  for (let i = 0; i <= n; i++) { out.push(`${y}-${String(m).padStart(2, '0')}`); m -= 1; if (m === 0) { m = 12; y -= 1; } }
  return out;
}

async function recordsFor(username, now, tz) {
  const db = store('attendance'), out = [];
  for (const month of monthsBack(now, tz, 1)) {
    const keys = await db.list(`rec/${month}/${username}/`);
    const rows = await Promise.all(keys.map((k) => db.get(k)));
    rows.forEach((r) => r && out.push(r));
  }
  return out.sort((a, b) => a.at - b.at);
}

export default wrap(async (req) => {
  const me = await requireRole(req, 'staff');
  const settings = await getSettings();
  const now = Date.now();
  const tz = settings.timezone;
  const recs = await recordsFor(me.username, now, tz);
  const last = recs[recs.length - 1];

  if (req.method === 'GET') {
    return json({
      staff: { name: me.name, role: me.jobRole || '', username: me.username },
      site: { configured: settings.lat != null && settings.lng != null, name: settings.name, radius: settings.radius, mode: settings.mode },
      state: last && last.type === 'in' ? 'in' : 'out',
      records: recs.slice(-80),
      serverNow: now,
      timezone: tz,
    });
  }

  if (req.method !== 'POST') throw httpError(405, 'Method not allowed.');
  if (!sameOrigin(req)) throw httpError(403, 'Forbidden.');
  const { data } = await readBody(req, 2000);

  if (last && now - last.at < 8000) throw httpError(429, 'Please wait a few seconds before clocking again.');
  const type = last && last.type === 'in' ? 'out' : 'in';
  const pos = data && typeof data.pos === 'object' ? data.pos : null;
  const j = judge(pos, settings);
  if (j.block) return json({ error: `${j.message} Clock-in is blocked until you are inside the allowed area.`, blocked: true }, 403);

  const id = crypto.randomBytes(3).toString('hex');
  const date = dayKey(now, tz);
  const ok = j.status !== 'unverified';
  const record = {
    id, username: me.username, name: me.name, type, at: now, date,
    status: j.status, dist: j.dist,
    acc: ok && Number.isFinite(pos.acc) ? Math.round(pos.acc) : null,
    lat: ok ? Math.round(pos.lat * 1e5) / 1e5 : null,
    lng: ok ? Math.round(pos.lng * 1e5) / 1e5 : null,
    manual: false,
  };
  await store('attendance').set(`rec/${date.slice(0, 7)}/${me.username}/${String(now).padStart(13, '0')}-${id}`, record);
  return json({ ok: true, record, message: j.message });
});

export const config = { path: '/api/attendance' };
