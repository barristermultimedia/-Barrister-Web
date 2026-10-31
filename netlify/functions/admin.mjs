// /api/admin/*  Full admin control: enquiries, staff, attendance, settings, exports. Admin session required.
import crypto from 'node:crypto';
import { wrap, json, readBody, sameOrigin, httpError, route, csvCell } from '../lib/http.mjs';
import { store } from '../lib/store.mjs';
import { requireRole, getSettings, saveSettings, hashPassword } from '../lib/auth.mjs';
import { dayKey, validTimeZone } from '../lib/geo.mjs';
import { notifyAll, enquiryMessage, integrationStatus } from '../lib/notify.mjs';

const STATUSES = ['new', 'contacted', 'won', 'closed', 'archived'];
const USERNAME = /^[a-z0-9._-]{3,32}$/;
const clip = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

async function getAll(db, keys) {
  const out = [];
  for (let i = 0; i < keys.length; i += 25) {
    const rows = await Promise.all(keys.slice(i, i + 25).map((k) => db.get(k).then((v) => (v ? { ...v, _key: k } : null))));
    rows.forEach((r) => r && out.push(r));
  }
  return out;
}
const publicStaff = ({ salt, hash, ...rest }) => rest;

async function enquiries() {
  const db = store('enquiries');
  const keys = (await db.list()).sort().reverse().slice(0, 1000);
  return (await getAll(db, keys)).map(({ _key, ...r }) => r);
}

async function staffList() {
  const db = store('staff');
  const rows = await getAll(db, await db.list());
  return rows.map(({ _key, ...r }) => publicStaff(r)).sort((a, b) => a.name.localeCompare(b.name));
}

async function attendance(month, staff) {
  const db = store('attendance');
  const prefix = staff ? `rec/${month}/${staff}/` : `rec/${month}/`;
  const rows = await getAll(db, await db.list(prefix));
  return rows.map(({ _key, ...r }) => ({ ...r, key: _key })).sort((a, b) => b.at - a.at);
}

function parseTime(v) {
  const t = typeof v === 'number' ? v : Date.parse(String(v));
  if (!Number.isFinite(t) || t < 946684800000 || t > Date.now() + 86400000) throw httpError(400, 'Enter a valid date and time that is not in the future.');
  return Math.round(t);
}

function attendanceKey(rec) {
  return `rec/${rec.date.slice(0, 7)}/${rec.username}/${String(rec.at).padStart(13, '0')}-${rec.id}`;
}

function csv(rows) { return rows.map((r) => r.map(csvCell).join(',')).join('\r\n'); }

function csvResponse(name, text) {
  return new Response('﻿' + text, { status: 200, headers: {
    'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${name}"`, 'cache-control': 'no-store' } });
}

async function handleGet(resource, req) {
  const url = new URL(req.url);
  const settings = await getSettings();
  const month = url.searchParams.get('month') || dayKey(Date.now(), settings.timezone).slice(0, 7);
  if (!MONTH.test(month)) throw httpError(400, 'Month must look like 2026-10.');

  if (resource === 'overview') {
    const enq = await enquiries();
    const counts = Object.fromEntries(STATUSES.map((s) => [s, 0]));
    enq.forEach((e) => { counts[e.status] = (counts[e.status] || 0) + 1; });
    const staff = await staffList();
    const today = dayKey(Date.now(), settings.timezone);
    const monthRecs = await attendance(today.slice(0, 7));
    const lastBy = {};
    monthRecs.slice().sort((a, b) => a.at - b.at).forEach((r) => { lastBy[r.username] = r; });
    const clockedIn = Object.values(lastBy).filter((r) => r.type === 'in' && r.date === today).map((r) => r.name);
    return json({ counts, staffCount: staff.length, clockedIn, integrations: integrationStatus(), settings });
  }
  if (resource === 'enquiries') return json({ items: await enquiries() });
  if (resource === 'staff') return json({ items: await staffList() });
  if (resource === 'attendance') {
    const staff = clip(url.searchParams.get('staff'), 64).toLowerCase();
    return json({ items: await attendance(month, staff || null), month });
  }
  if (resource === 'export') {
    const type = url.searchParams.get('type');
    if (type === 'enquiries') {
      const rows = await enquiries();
      return csvResponse('barrister-enquiries.csv', csv([
        ['Received', 'Name', 'Email', 'Phone', 'Service', 'Budget', 'Delivery', 'Status', 'Message', 'Notes', 'Email sent', 'WhatsApp sent'],
        ...rows.map((e) => [new Date(e.createdAt).toISOString(), e.name, e.email, e.phone, e.service, e.budget, e.timeline, e.status, e.message, e.notes, e.notified && e.notified.email, e.notified && e.notified.whatsapp]),
      ]));
    }
    if (type === 'attendance') {
      const rows = (await attendance(month)).sort((a, b) => a.at - b.at);
      return csvResponse(`barrister-attendance-${month}.csv`, csv([
        ['Date', 'Time (UTC)', 'Staff', 'Username', 'Type', 'Location', 'Distance (m)', 'Latitude', 'Longitude', 'Manual', 'Note'],
        ...rows.map((r) => [r.date, new Date(r.at).toISOString().slice(11, 19), r.name, r.username, r.type, r.status, r.dist, r.lat, r.lng, r.manual ? 'yes' : '', r.note]),
      ]));
    }
    throw httpError(400, 'Unknown export.');
  }
  throw httpError(404, 'Not found.');
}

async function handlePost(resource, data) {
  if (resource === 'enquiries') {
    const db = store('enquiries');
    const id = clip(data.id, 60);
    const rec = await db.get(id);
    if (!rec) throw httpError(404, 'That enquiry no longer exists.');
    if (data.op === 'status') {
      if (!STATUSES.includes(data.status)) throw httpError(400, 'Unknown status.');
      rec.status = data.status;
    } else if (data.op === 'notes') {
      rec.notes = clip(data.notes, 2000);
    } else if (data.op === 'delete') {
      await db.delete(id); return json({ ok: true });
    } else if (data.op === 'resend') {
      rec.notified = await notifyAll({ subject: `New ${rec.kind || 'enquiry'}: ${rec.service} from ${rec.name}`, text: enquiryMessage(rec), replyTo: rec.email });
    } else throw httpError(400, 'Unknown action.');
    await db.set(id, rec);
    return json({ ok: true, item: rec });
  }

  if (resource === 'staff') {
    const db = store('staff');
    const username = clip(data.username, 32).toLowerCase();
    if (data.op === 'create') {
      if (!USERNAME.test(username)) throw httpError(400, 'Username must be 3 to 32 letters, numbers, dots, dashes or underscores.');
      if (username === (process.env.ADMIN_USERNAME || 'admin').toLowerCase()) throw httpError(400, 'That username is reserved.');
      if (await db.get(username)) throw httpError(409, 'That username is already taken.');
      const name = clip(data.name, 100); if (!name) throw httpError(400, 'Enter the staff member’s name.');
      const password = String(data.password || '');
      if (password.length < 8 || password.length > 200) throw httpError(400, 'Use a password of at least 8 characters.');
      const rec = { username, name, role: clip(data.role, 80), phone: clip(data.phone, 40), active: true, createdAt: Date.now(), ...hashPassword(password) };
      await db.set(username, rec);
      return json({ ok: true, item: publicStaff(rec) });
    }
    const rec = await db.get(username);
    if (!rec) throw httpError(404, 'That staff member no longer exists.');
    if (data.op === 'update') {
      if (data.name !== undefined) { rec.name = clip(data.name, 100); if (!rec.name) throw httpError(400, 'Name cannot be empty.'); }
      if (data.role !== undefined) rec.role = clip(data.role, 80);
      if (data.phone !== undefined) rec.phone = clip(data.phone, 40);
      if (data.active !== undefined) rec.active = !!data.active;
    } else if (data.op === 'reset') {
      const password = String(data.password || '');
      if (password.length < 8 || password.length > 200) throw httpError(400, 'Use a password of at least 8 characters.');
      Object.assign(rec, hashPassword(password));
    } else if (data.op === 'delete') {
      await db.delete(username); return json({ ok: true });
    } else throw httpError(400, 'Unknown action.');
    await db.set(username, rec);
    return json({ ok: true, item: publicStaff(rec) });
  }

  if (resource === 'attendance') {
    const db = store('attendance');
    const settings = await getSettings();
    if (data.op === 'delete') {
      const key = clip(data.key, 200); if (!key.startsWith('rec/')) throw httpError(400, 'Bad record.');
      await db.delete(key); return json({ ok: true });
    }
    if (data.op === 'add') {
      const username = clip(data.username, 32).toLowerCase();
      const staff = await store('staff').get(username);
      if (!staff) throw httpError(404, 'Choose a staff member.');
      if (!['in', 'out'].includes(data.type)) throw httpError(400, 'Choose clock in or clock out.');
      const at = parseTime(data.at);
      const rec = { id: crypto.randomBytes(3).toString('hex'), username, name: staff.name, type: data.type, at, date: dayKey(at, settings.timezone),
        status: 'manual', dist: null, acc: null, lat: null, lng: null, manual: true, note: clip(data.note, 300) };
      await db.set(attendanceKey(rec), rec);
      return json({ ok: true, item: { ...rec, key: attendanceKey(rec) } });
    }
    if (data.op === 'update') {
      const key = clip(data.key, 200); if (!key.startsWith('rec/')) throw httpError(400, 'Bad record.');
      const rec = await db.get(key); if (!rec) throw httpError(404, 'That record no longer exists.');
      if (data.type !== undefined) { if (!['in', 'out'].includes(data.type)) throw httpError(400, 'Choose clock in or clock out.'); rec.type = data.type; }
      if (data.at !== undefined) { rec.at = parseTime(data.at); rec.date = dayKey(rec.at, settings.timezone); }
      if (data.note !== undefined) rec.note = clip(data.note, 300);
      rec.edited = true;
      const next = attendanceKey(rec);
      if (next !== key) await db.delete(key);
      await db.set(next, rec);
      return json({ ok: true, item: { ...rec, key: next } });
    }
    throw httpError(400, 'Unknown action.');
  }

  if (resource === 'settings') {
    const lat = data.lat === '' || data.lat == null ? null : Number(data.lat);
    const lng = data.lng === '' || data.lng == null ? null : Number(data.lng);
    if ((lat !== null && !(lat >= -90 && lat <= 90)) || (lng !== null && !(lng >= -180 && lng <= 180)) || ((lat === null) !== (lng === null))) {
      throw httpError(400, 'Enter both coordinates, latitude between -90 and 90 and longitude between -180 and 180.');
    }
    const radius = parseInt(data.radius, 10);
    if (!(radius >= 20 && radius <= 5000)) throw httpError(400, 'Allowed distance must be between 20 and 5000 metres.');
    if (!['flag', 'require'].includes(data.mode)) throw httpError(400, 'Choose what happens outside the area.');
    const timezone = clip(data.timezone, 60) || 'UTC';
    if (!validTimeZone(timezone)) throw httpError(400, 'Unknown time zone. Use a name like Africa/Lagos or Europe/London.');
    return json({ ok: true, settings: await saveSettings({ name: clip(data.name, 80) || 'Studio', lat, lng, radius, mode: data.mode, timezone }) });
  }

  if (resource === 'test-notify') {
    const result = await notifyAll({ subject: 'Test from the Barrister Multimedia admin page', text: 'This is a test message. If you can read it, notifications are working.' });
    return json({ ok: true, result });
  }

  if (resource === 'signout-all') {
    const s = await getSettings();
    await saveSettings({ sessionVersion: (s.sessionVersion || 1) + 1 });
    return json({ ok: true });
  }

  throw httpError(404, 'Not found.');
}

export default wrap(async (req) => {
  const resource = route(req)[1];
  await requireRole(req, 'admin');
  if (req.method === 'GET') return handleGet(resource, req);
  if (req.method === 'POST') {
    if (!sameOrigin(req)) throw httpError(403, 'Forbidden.');
    const { data } = await readBody(req);
    return handlePost(resource, data);
  }
  throw httpError(405, 'Method not allowed.');
});

export const config = { path: '/api/admin/*' };
