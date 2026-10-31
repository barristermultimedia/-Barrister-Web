// Sends every enquiry to Gmail and WhatsApp. Both are best effort: a failure never loses the enquiry,
// because it is already saved for the admin page before anything is sent.

export const _deps = {}; // lets tests replace nodemailer / fetch

const clean = (s) => String(s || '').replace(/[\r\n]+/g, ' ').trim();

export function integrationStatus() {
  return {
    email: !!(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD),
    whatsapp: !!(process.env.WHATSAPP_WEBHOOK_URL || (process.env.WHATSAPP_PHONE && process.env.CALLMEBOT_APIKEY)),
    sessionSecret: !!(process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 16),
    adminPassword: !!process.env.ADMIN_PASSWORD,
  };
}

async function sendEmail({ subject, text, replyTo }) {
  const user = process.env.GMAIL_USER, pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) return 'skipped';
  const nodemailer = _deps.nodemailer || (await import('nodemailer')).default;
  const transport = nodemailer.createTransport({
    service: 'gmail', auth: { user, pass }, connectionTimeout: 7000, greetingTimeout: 7000, socketTimeout: 9000,
  });
  const mail = { from: `"Barrister Multimedia website" <${user}>`, to: process.env.NOTIFY_EMAIL || user, subject: clean(subject), text };
  if (replyTo && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(replyTo)) mail.replyTo = replyTo;
  await transport.sendMail(mail);
  return 'sent';
}

async function sendWhatsApp(text) {
  const f = _deps.fetch || fetch;
  const hook = process.env.WHATSAPP_WEBHOOK_URL;
  const phone = (process.env.WHATSAPP_PHONE || '').replace(/[^\d]/g, '');
  const body = text.slice(0, 900);
  if (hook) {
    // Any gateway that accepts a JSON POST (Twilio Function, Make, Zapier, your own bot).
    const r = await f(hook, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ to: phone, text: body }), signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error('WhatsApp webhook returned ' + r.status);
    return 'sent';
  }
  const key = process.env.CALLMEBOT_APIKEY;
  if (!phone || !key) return 'skipped';
  const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(phone)}&text=${encodeURIComponent(body)}&apikey=${encodeURIComponent(key)}`;
  const r = await f(url, { signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error('CallMeBot returned ' + r.status);
  return 'sent';
}

/** Returns { email, whatsapp }, each 'sent' | 'skipped' | 'failed'. */
export async function notifyAll({ subject, text, replyTo }) {
  const [e, w] = await Promise.allSettled([sendEmail({ subject, text, replyTo }), sendWhatsApp(text)]);
  const val = (r, label) => {
    if (r.status === 'fulfilled') return r.value;
    console.error(label + ' notification failed:', r.reason && r.reason.message);
    return 'failed';
  };
  return { email: val(e, 'Email'), whatsapp: val(w, 'WhatsApp') };
}

export function enquiryMessage(r) {
  return [
    `New enquiry: ${r.service}`,
    `Name: ${r.name}`,
    r.email ? `Email: ${r.email}` : null,
    r.phone ? `Phone: ${r.phone}` : null,
    `Budget: ${r.budget}`,
    `Delivery: ${r.timeline}`,
    '',
    r.message,
  ].filter((x) => x !== null).join('\n');
}
