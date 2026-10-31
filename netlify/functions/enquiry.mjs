// POST /api/enquiry  Public contact form. Saves the enquiry for the admin page, then sends it to Gmail and WhatsApp.
import crypto from 'node:crypto';
import { wrap, json, redirect, readBody, sameOrigin, httpError, clientIp } from '../lib/http.mjs';
import { store } from '../lib/store.mjs';
import { rateLimit, ipKey } from '../lib/auth.mjs';
import { notifyAll, enquiryMessage } from '../lib/notify.mjs';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const clip = (v, n) => String(v == null ? '' : v).trim().slice(0, n);

export default wrap(async (req, context) => {
  if (req.method !== 'POST') throw httpError(405, 'Method not allowed.');
  if (!sameOrigin(req)) throw httpError(403, 'Forbidden.');
  const { data, form } = await readBody(req);

  // Hidden field that only bots fill in: pretend it worked.
  if (clip(data.website, 200)) return form ? redirect('/contact.html?sent=1') : json({ ok: true });

  const r = {
    name: clip(data.name, 100),
    email: clip(data.email, 160).toLowerCase(),
    phone: clip(data.phone, 40),
    service: clip(data.service, 80) || 'General enquiry',
    budget: clip(data.budget, 60) || 'Not sure yet',
    timeline: clip(data.timeline, 60) || 'No fixed date',
    message: clip(data.message, 4000),
    kind: clip(data.kind, 30) || 'enquiry',
  };
  const problems = {};
  if (!r.name) problems.name = 'Enter your name.';
  if (r.email && !EMAIL.test(r.email)) problems.email = 'Check the email address.';
  if (!r.email && !r.phone) problems.phone = 'Add an email or a phone number.';
  if (!r.message) problems.message = 'Tell us a little about the project.';
  if (Object.keys(problems).length) {
    return form ? redirect('/contact.html?error=1') : json({ error: 'Please check the form.', problems }, 422);
  }

  await rateLimit(ipKey('enq', clientIp(req, context)), 6, 60 * 60 * 1000,
    'You have sent several enquiries already. Please wait a while, or message us on WhatsApp.');

  const id = `${String(Date.now()).padStart(13, '0')}-${crypto.randomBytes(3).toString('hex')}`;
  const record = { id, createdAt: Date.now(), ...r, status: 'new', notes: '', notified: { email: 'pending', whatsapp: 'pending' } };
  await store('enquiries').set(id, record); // saved first, so it is never lost

  record.notified = await notifyAll({
    subject: `New ${r.kind}: ${r.service} from ${r.name}`,
    text: enquiryMessage(r),
    replyTo: r.email,
  });
  await store('enquiries').set(id, record);

  return form ? redirect('/contact.html?sent=1') : json({ ok: true, id });
});

export const config = { path: '/api/enquiry' };
