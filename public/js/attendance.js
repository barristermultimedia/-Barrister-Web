/* Staff attendance page: clock in and out with a server-checked location. */
(function () {
  'use strict';
  var B = window.BM, h = B.h, app = B.$('#app');
  var data = null, busy = false, tick = null, ui = null;

  function needSignIn() {
    app.replaceChildren(B.notice('warn', 'Please sign in first.', 'Sign in on the staff page to record attendance.'),
      h('p', { style: 'margin-top:1rem' }, h('a', { class: 'btn', href: 'staff.html', text: 'Staff login' })));
  }
  function load() {
    return B.api('GET', '/api/attendance').then(function (r) {
      if (r.status === 401 || r.status === 403) return needSignIn();
      if (!r.ok) { app.replaceChildren(B.notice('bad', r.data.error || 'Could not load attendance.')); return; }
      data = r.data; if (!ui) build(); paint();
    });
  }
  function build() {
    var clk = h('div', { class: 'clock' }), cdate = h('div', { class: 'clock-date' });
    var status = h('p', { class: 'statusline' });
    var btn = h('button', { type: 'button', class: 'btn bigbtn', on: { click: clock } });
    var msg = h('div', { 'aria-live': 'polite', tabindex: '-1', style: 'margin-top:1rem' });
    var hello = h('h2');
    var siteBody = h('div'), histBody = h('div');
    var pw = passwordPanel();
    var out = h('button', { type: 'button', class: 'btn line sm', text: 'Sign out', on: { click: function () { B.api('POST', '/api/logout', {}).then(function () { window.location.href = 'staff.html'; }); } } });
    app.replaceChildren(h('div', { class: 'form-wrap', style: 'margin-top:0' },
      h('div', { class: 'panel' }, hello, clk, cdate, status, btn, msg),
      h('aside', { class: 'panel' }, h('h2', { text: 'Studio location' }), siteBody,
        h('p', { class: 'sub', style: 'margin-top:1rem;font-size:.9rem' }, 'Your location is read only when you clock in or out, and is saved with that record.')),
      h('div', { class: 'panel', style: 'grid-column:1/-1' }, h('h2', { text: 'Your recent days' }), histBody),
      h('div', { class: 'panel', style: 'grid-column:1/-1' }, h('h2', { text: 'Your account' }), pw, h('p', { style: 'margin-top:1rem' }, out))));
    ui = { clk: clk, cdate: cdate, status: status, btn: btn, msg: msg, hello: hello, siteBody: siteBody, histBody: histBody };
    function t() { var n = new Date(); clk.textContent = B.pad(n.getHours()) + ':' + B.pad(n.getMinutes()) + ':' + B.pad(n.getSeconds()); cdate.textContent = n.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); }
    t(); tick = setInterval(t, 1000);
  }
  function paint() {
    var d = data, inNow = d.state === 'in', last = d.records[d.records.length - 1];
    ui.hello.textContent = 'Hello, ' + d.staff.name.split(' ')[0];
    ui.btn.textContent = inNow ? 'Clock out' : 'Clock in';
    ui.btn.className = 'btn bigbtn' + (inNow ? ' out' : '');
    ui.status.textContent = inNow && last ? 'You clocked in at ' + B.timeStr(last.at) + '.' : 'You are not clocked in.';
    ui.siteBody.replaceChildren(d.site.configured
      ? h('dl', { class: 'info' },
          h('div', null, h('dt', { text: 'Site' }), h('dd', { text: d.site.name })),
          h('div', null, h('dt', { text: 'Allowed distance' }), h('dd', { text: d.site.radius + ' m' })),
          h('div', null, h('dt', { text: 'Outside the area' }), h('dd', { class: 'mute', text: d.site.mode === 'require' ? 'Clock-in is blocked.' : 'Clock-in is allowed and flagged for review.' })))
      : h('p', { class: 'sub', style: 'margin:0', text: 'The studio location has not been set yet. Check-ins are recorded without a distance check.' }));
    var dd = B.days(d.records).slice(0, 10);
    ui.histBody.replaceChildren(!dd.length
      ? h('p', { class: 'sub', style: 'margin:0', text: 'No attendance yet. Your first check-in will appear here.' })
      : h('div', { class: 'hist' }, dd.map(function (x) {
          return h('div', { class: 'hist-row' }, h('b', { text: B.niceDate(x.date) }),
            h('span', { class: 'mute', text: (x.inAt ? B.timeStr(x.inAt) : '-') + ' to ' + (x.open ? 'still in' : (x.outAt ? B.timeStr(x.outAt) : '-')) + (x.ms ? '  ·  ' + B.dur(x.ms) : '') }),
            B.flag(x.worst, x.dist));
        })));
  }
  function say(kind, title, text) { ui.msg.replaceChildren(B.notice(kind, title, text)); }
  function clock() {
    if (busy) return; busy = true; ui.btn.disabled = true;
    say('', 'Checking your location…');
    B.getPos().then(function (p) {
      return B.api('POST', '/api/attendance', { pos: p.err ? null : { lat: p.lat, lng: p.lng, acc: p.acc } }).then(function (r) {
        if (r.ok) {
          say(r.data.record.status === 'verified' || r.data.record.status === 'nosite' ? 'ok' : 'warn', (r.data.record.type === 'in' ? 'Clocked in' : 'Clocked out') + ' at ' + B.timeStr(r.data.record.at) + '.', r.data.message + (p.err ? ' Your browser did not share your location, so this record is flagged.' : ''));
          return load();
        }
        if (r.status === 401) return needSignIn();
        say(r.status === 403 ? 'warn' : 'bad', r.data.error || 'Could not save. Try again.', p.err && r.status === 403 ? 'Allow location for this site in your browser settings and try again.' : '');
      });
    }).then(function () { busy = false; if (ui) ui.btn.disabled = false; ui && ui.msg.focus(); });
  }
  function passwordPanel() {
    var cur = h('input', { type: 'password', id: 'pwCur', autocomplete: 'current-password' });
    var nw = h('input', { type: 'password', id: 'pwNew', autocomplete: 'new-password', 'aria-describedby': 'pwHint' });
    var msg = h('div', { 'aria-live': 'polite' });
    var f = h('form', { novalidate: true },
      h('div', { class: 'fgrid' },
        h('div', { class: 'fld' }, h('label', { for: 'pwCur', text: 'Current password' }), cur),
        h('div', { class: 'fld' }, h('label', { for: 'pwNew', text: 'New password' }), nw, h('span', { class: 'hint', id: 'pwHint', text: 'At least 8 characters.' })),
        h('div', { class: 'fld wide' }, msg, h('button', { type: 'submit', class: 'btn line sm', text: 'Change password' }))));
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      B.api('POST', '/api/password', { current: cur.value, next: nw.value }).then(function (r) {
        msg.replaceChildren(r.ok ? B.notice('ok', 'Password changed.') : B.notice('bad', r.data.error || 'Could not change the password.'));
        if (r.ok) { cur.value = ''; nw.value = ''; }
      });
    });
    return f;
  }
  load();
})();
