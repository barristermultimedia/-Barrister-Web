/* Shared helpers for the staff and admin pages. */
window.BM = (function () {
  'use strict';
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function h(tag, attrs) {
    var el = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k]; if (v == null || v === false) return;
      if (k === 'text') el.textContent = v; else if (k === 'class') el.className = v; else if (k === 'on') Object.keys(v).forEach(function (ev) { el.addEventListener(ev, v[ev]); }); else el.setAttribute(k, v === true ? '' : v);
    });
    for (var i = 2; i < arguments.length; i++) (function add(c) {
      if (c == null || c === false) return;
      if (Array.isArray(c)) return c.forEach(add);
      el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    })(arguments[i]);
    return el;
  }
  function api(method, url, body) {
    var opts = { method: method, credentials: 'same-origin', headers: {} };
    if (body !== undefined) { opts.headers['content-type'] = 'application/json'; opts.body = JSON.stringify(body); }
    return fetch(url, opts).then(function (r) {
      var type = r.headers.get('content-type') || '';
      return (type.indexOf('json') >= 0 ? r.json().catch(function () { return {}; }) : r.text()).then(function (data) { return { ok: r.ok, status: r.status, data: data }; });
    }, function () { return { ok: false, status: 0, data: { error: 'You seem to be offline. Check your connection and try again.' } }; });
  }
  function notice(kind, title, text, actions) {
    return h('div', { class: 'notice ' + kind, role: kind === 'bad' ? 'alert' : 'status' }, h('b', { text: title }), text ? h('p', { text: text }) : null, actions ? h('div', { class: 'acts' }, actions) : null);
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function dateKey(ts) { var d = new Date(ts); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function timeStr(ts) { var d = new Date(ts); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function dur(ms) { var m = Math.round(ms / 60000); return Math.floor(m / 60) + 'h ' + pad(m % 60) + 'm'; }
  function niceDate(k) { var p = k.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }); }
  function toLocalInput(ms) { var d = new Date(ms); return dateKey(ms) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function getPos() {
    return new Promise(function (res) {
      try {
        if (!navigator.geolocation) return res({ err: 'unsupported' });
        navigator.geolocation.getCurrentPosition(
          function (p) { res({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy }); },
          function (e) { res({ err: e && e.code === 1 ? 'denied' : 'unavailable' }); },
          { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 });
      } catch (e) { res({ err: 'unsupported' }); }
    });
  }
  var LABEL = { verified: ['ok', 'Verified'], nosite: ['warn', 'No site set'], unverified: ['warn', 'Not verified'], outside: ['bad', 'Outside area'], manual: ['warn', 'Added by admin'] };
  function flag(status, dist) {
    var m = LABEL[status] || LABEL.unverified;
    return h('span', { class: 'flag ' + m[0], text: m[1] + (status === 'outside' && dist != null ? ' (' + dist + ' m)' : '') });
  }
  var RANK = { verified: 0, manual: 1, nosite: 1, unverified: 2, outside: 3 };
  function days(records) {
    var by = {};
    records.slice().sort(function (a, b) { return a.at - b.at; }).forEach(function (r) { var k = r.date || dateKey(r.at); (by[k] = by[k] || []).push(r); });
    return Object.keys(by).sort().reverse().map(function (k) {
      var first = null, last = null, ms = 0, open = null, worst = 'verified', dist = null;
      by[k].forEach(function (r) {
        if (r.type === 'in') { if (first == null) first = r.at; open = r.at; }
        else if (r.type === 'out') { last = r.at; if (open != null) { ms += r.at - open; open = null; } }
        if ((RANK[r.status] || 0) > (RANK[worst] || 0)) { worst = r.status; dist = r.dist; }
      });
      return { date: k, inAt: first, outAt: last, ms: ms, open: open != null, worst: worst, dist: dist };
    });
  }
  function confirmBtn(label, sure, fn, cls) {
    var armed = false, t;
    var b = h('button', { type: 'button', class: 'btn sm ' + (cls || 'line'), text: label });
    b.addEventListener('click', function () {
      if (!armed) { armed = true; b.textContent = sure; t = setTimeout(function () { armed = false; b.textContent = label; }, 4000); return; }
      clearTimeout(t); armed = false; b.textContent = label; fn(b);
    });
    return b;
  }
  /* Sign-in form used on the staff page and the admin page. */
  function loginForm(opts) {
    var user = h('input', { type: 'text', id: 'lUser', name: 'username', autocomplete: 'username', autocapitalize: 'none', spellcheck: 'false', 'aria-required': 'true' });
    var pass = h('input', { type: 'password', id: 'lPass', name: 'password', autocomplete: 'current-password', 'aria-required': 'true' });
    var msg = h('div', { 'aria-live': 'polite', tabindex: '-1', id: 'lMsg' });
    var go = h('button', { type: 'submit', class: 'btn', text: 'Sign in' });
    var form = h('form', { novalidate: true },
      h('div', { class: 'fgrid' },
        h('div', { class: 'fld wide' }, h('label', { for: 'lUser', text: 'Username' }), user),
        h('div', { class: 'fld wide' }, h('label', { for: 'lPass', text: 'Password' }), pass),
        h('div', { class: 'fld wide' }, msg, go)));
    if (opts.username) user.value = opts.username;
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!user.value.trim() || !pass.value) { msg.replaceChildren(notice('bad', 'Enter your username and password.')); msg.focus(); return; }
      go.disabled = true; go.textContent = 'Signing in';
      api('POST', '/api/login', { username: user.value.trim(), password: pass.value }).then(function (r) {
        go.disabled = false; go.textContent = 'Sign in';
        if (r.ok) { opts.onSuccess(r.data); return; }
        msg.replaceChildren(notice('bad', r.data.error || 'Could not sign in.')); msg.focus(); pass.value = '';
      });
    });
    return form;
  }
  return { $: $, $$: $$, h: h, api: api, notice: notice, pad: pad, dateKey: dateKey, timeStr: timeStr, dur: dur, niceDate: niceDate, toLocalInput: toLocalInput, getPos: getPos, flag: flag, days: days, confirmBtn: confirmBtn, loginForm: loginForm };
})();
