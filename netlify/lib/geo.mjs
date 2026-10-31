// Distance and location checks for attendance. Runs on the server, so the decision is not left to the browser.

export function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371000, r = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * r) / 2);
  const b = Math.sin(((lng2 - lng1) * r) / 2);
  const x = a * a + Math.cos(lat1 * r) * Math.cos(lat2 * r) * b * b;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
}

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/**
 * pos: { lat, lng, acc } from the browser, or null when the browser could not provide it.
 * Returns { status, dist, block, message } where status is verified | outside | unverified | nosite.
 */
export function judge(pos, site) {
  const hasSite = num(site.lat) !== null && num(site.lng) !== null;
  const strict = hasSite && site.mode === 'require';
  const lat = pos && num(pos.lat), lng = pos && num(pos.lng);
  if (lat === null || lng === null || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return { status: 'unverified', dist: null, block: strict, message: 'Your location could not be read.' };
  }
  if (!hasSite) return { status: 'nosite', dist: null, block: false, message: 'No studio location is set yet, so no distance was checked.' };
  const dist = Math.round(haversine(lat, lng, site.lat, site.lng));
  const allowed = Number(site.radius) || 100;
  const where = site.name || 'the studio';
  if (dist <= allowed) return { status: 'verified', dist, block: false, message: `Location verified: ${dist} m from ${where}.` };
  return { status: 'outside', dist, block: strict, message: `You are ${dist} m from ${where}. The allowed distance is ${allowed} m.` };
}

/** YYYY-MM-DD for a timestamp in the studio's time zone. */
export function dayKey(ts, timeZone = 'UTC') {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ts));
  } catch {
    return new Date(ts).toISOString().slice(0, 10);
  }
}

export function validTimeZone(tz) {
  try { new Intl.DateTimeFormat('en-CA', { timeZone: tz }); return true; } catch { return false; }
}
