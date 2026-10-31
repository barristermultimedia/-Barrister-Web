/* Admin page: full control of enquiries, staff, attendance and settings. */
(function () {
  'use strict';
  var B = window.BM, h = B.h, app = B.$('#app');
  var TABS = [
    { id: 'overview', label: 'Overview', render: overview },
    { id: 'enquiries', label: 'Enquiries', render: enquiries },
    { id: 'staff', label: 'Staff', render: staff },
    { id: 'attendance', label: 'Attendance', render: attendance },
    { id: 'settings', label: 'Settings', render: settings }
  ];
  var tabEls = {}, panels = {};
  function put(el, x) { el.replaceChildren.apply(el, [].concat(x)); }

  /* ---------- sign-in ---------- */
  function showLogin(msg) {
    app.replaceChildren(h('div', { class: 'panel', style: 'max-width:520px;margin-inline:auto' },
      h('h2', { text: 'Administrator sign-in' }),
      msg ? B.notice('warn', msg) : null,
      B.loginForm({ username: '', onSuccess: function (d) {
        if (d.role !== 'admin') { B.api('POST', '/api/logout', {}).then(function () { showLogin('That account is a staff account. Staff sign in on the Staff login page.'); }); return; }
        init();
      } })));
  }
  function guard(r) {
    if (r.status === 401 || r.status === 403) { showLogin('Your session has ended. Please sign in again.'); return false; }
    return true;
  }
  function fail(el, r) { el.prepend(B.notice('bad', r.data && r.data.error ? r.data.error : 'Something went wrong. Please try again.')); }

  /* ---------- shell and tabs ---------- */
  function init() {
    var list = h('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Admin sections' });
    TABS.forEach(function (t) {
      var b = h('button', { type: 'button', role: 'tab', id: 'tab-' + t.id, 'aria-controls': 'panel-' + t.id, 'aria-selected': 'false', tabindex: '-1', text: t.label, on: { click: function () { location.hash = t.id; } } });
      tabEls[t.id] = b; list.appendChild(b);
    });
    list.addEventListener('keydown', function (e) {
      var i = TABS.map(function (t) { return t.id; }).indexOf(current());
      var n = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? TABS.length - 1 : null;
      if (n === null) return; e.preventDefault();
      n = (n + TABS.length) % TABS.length; location.hash = TABS[n].id; tabEls[TABS[n].id].focus();
    });
    var out = h('div', { class: 'grp' },
      h('button', { type: 'button', class: 'btn line sm', text: 'Sign out', on: { click: function () { B.api('POST', '/api/logout', {}).then(function () { showLogin(); }); } } }));
    app.replaceChildren(h('div', { class: 'toolbar', style: 'margin-top:0' }, h('p', { class: 'sub', style: 'margin:0', text: 'Signed in as administrator.' }), out), list);
    TABS.forEach(function (t) {
      var p = h('div', { class: 'tab-panel', role: 'tabpanel', id: 'panel-' + t.id, 'aria-labelledby': 'tab-' + t.id, hidden: true });
      panels[t.id] = p; app.appendChild(p);
    });
    window.removeEventListener('hashchange', show); window.addEventListener('hashchange', show); show();
  }
  function current() { var t = (location.hash || '').slice(1); return tabEls[t] ? t : 'overview'; }
  function show() {
    var id = current();
    TABS.forEach(function (t) {
      var on = t.id === id;
      tabEls[t.id].setAttribute('aria-selected', on ? 'true' : 'false'); tabEls[t.id].tabIndex = on ? 0 : -1; panels[t.id].hidden = !on;
    });
    var t = TABS.filter(function (x) { return x.id === id; })[0];
    panels[id].replaceChildren(h('p', { class: 'sub', text: 'Loading…' }));
    t.render(panels[id]);
  }
  function field(label, input, hint, wide) {
    var id = input.id;
    return h('div', { class: 'fld' + (wide ? ' wide' : '') }, h('label', { for: id, text: label }), input, hint ? h('span', { class: 'hint', text: hint }) : null);
  }
  function input(id, type, value, extra) { return h('input', Object.assign({ type: type || 'text', id: id, value: value == null ? '' : value }, extra || {})); }
  function select(id, opts, value) {
    var s = h('select', { id: id }); opts.forEach(function (o) { var op = h('option', { value: o[0], text: o[1] }); if (o[0] === value) op.selected = true; s.appendChild(op); }); return s;
  }
  function digits(v) { return String(v || '').replace(/[^\d]/g, ''); }

  /* ---------- overview ---------- */
  function overview(p) {
    B.api('GET', '/api/admin/overview').then(function (r) {
      if (!guard(r)) return; if (!r.ok) { p.replaceChildren(); return fail(p, r); }
      var d = r.data, i = d.integrations;
      function stat(label, value, tab, sub) {
        return h('a', { class: 'panel', href: '#' + tab, style: 'text-decoration:none;display:block' }, h('p', { class: 'eyebrow', text: label }), h('p', { class: 'clock', text: String(value) }), sub ? h('p', { class: 'sub', style: 'margin:.3rem 0 0', text: sub }) : null);
      }
      function row(ok, name, help) {
        return h('li', { style: 'display:flex;flex-wrap:wrap;gap:.5rem 1rem;align-items:baseline;padding:.6rem 0;border-bottom:1px solid var(--line)' },
          h('b', { text: name }), h('span', { class: 'flag ' + (ok ? 'ok' : 'warn'), text: ok ? 'Connected' : 'Not set up' }), ok ? null : h('span', { class: 'mute', style: 'font-variant-numeric:normal', text: help }));
      }
      var testOut = h('div', { 'aria-live': 'polite', style: 'margin-top:1rem' });
      var test = h('button', { type: 'button', class: 'btn sm', text: 'Send a test notification', on: { click: function () {
        test.disabled = true; testOut.replaceChildren(h('p', { class: 'sub', text: 'Sending…' }));
        B.api('POST', '/api/admin/test-notify', {}).then(function (t) {
          test.disabled = false;
          if (!t.ok) return testOut.replaceChildren(B.notice('bad', t.data.error || 'The test failed.'));
          var x = t.data.result, lab = { sent: 'sent', skipped: 'not set up', failed: 'failed' };
          testOut.replaceChildren(B.notice(x.email === 'failed' || x.whatsapp === 'failed' ? 'warn' : 'ok', 'Gmail: ' + lab[x.email] + '. WhatsApp: ' + lab[x.whatsapp] + '.', x.email === 'failed' || x.whatsapp === 'failed' ? 'Check the keys in Netlify and the function log.' : ''));
        });
      } } });
      p.replaceChildren(
        h('div', { class: 'cards' }, stat('New enquiries', d.counts.new || 0, 'enquiries', 'Waiting for a reply'), stat('Staff accounts', d.staffCount, 'staff'), stat('Clocked in today', d.clockedIn.length, 'attendance', d.clockedIn.join(', '))),
        h('div', { class: 'panel', style: 'margin-top:1.4rem' }, h('h2', { text: 'Notifications and security' }),
          h('ul', { style: 'list-style:none;margin:0;padding:0' },
            row(i.email, 'Gmail', 'Add GMAIL_USER and GMAIL_APP_PASSWORD in Netlify.'),
            row(i.whatsapp, 'WhatsApp', 'Add WHATSAPP_PHONE and CALLMEBOT_APIKEY (or WHATSAPP_WEBHOOK_URL) in Netlify.'),
            row(i.adminPassword, 'Admin password', 'Add ADMIN_PASSWORD in Netlify.'),
            row(i.sessionSecret, 'Session secret', 'Add SESSION_SECRET (16+ random characters) in Netlify.')),
          test, testOut,
          h('div', { style: 'margin-top:1.2rem;display:flex;gap:.7rem;flex-wrap:wrap;align-items:center' },
            B.confirmBtn('Sign out everyone', 'Click again to sign everyone out', function () { B.api('POST', '/api/admin/signout-all', {}).then(function () { showLogin('Everyone was signed out. Sign in again.'); }); }),
            h('span', { class: 'mute', style: 'font-variant-numeric:normal', text: 'To change the admin password, change ADMIN_PASSWORD in Netlify and redeploy.' }))));
    });
  }

  /* ---------- enquiries ---------- */
  function enquiries(p) {
    var items = [], state = { status: 'all', q: '' };
    var list = h('div', { class: 'list' }), counts = h('div', { class: 'grp' });
    var sel = select('enqStatus', [['all', 'All except archived'], ['new', 'New'], ['contacted', 'Contacted'], ['won', 'Won'], ['closed', 'Closed'], ['archived', 'Archived'], ['every', 'Everything']], 'all');
    var q = input('enqSearch', 'text', '', { placeholder: 'Search name, email or message' });
    sel.addEventListener('change', function () { state.status = sel.value; draw(); });
    q.addEventListener('input', function () { state.q = q.value.toLowerCase(); draw(); });
    var csv = h('a', { class: 'btn line sm', href: '/api/admin/export?type=enquiries', download: 'barrister-enquiries.csv', text: 'Download CSV' });
    p.replaceChildren(h('div', { class: 'toolbar', style: 'margin-top:0' }, counts,
      h('div', { class: 'grp' }, h('label', { for: 'enqStatus', class: 'sr', text: 'Show' }), sel, h('label', { for: 'enqSearch', class: 'sr', text: 'Search' }), q, csv)), list);

    function chip(label, v) { return h('span', { class: 'flag ' + (v === 'sent' ? 'ok' : v === 'failed' ? 'bad' : 'warn'), text: label + ': ' + (v === 'sent' ? 'sent' : v === 'failed' ? 'failed' : 'not set up') }); }
    function draw() {
      var c = {}; items.forEach(function (e) { c[e.status] = (c[e.status] || 0) + 1; });
      counts.replaceChildren(h('span', { class: 'pill hot', text: (c.new || 0) + ' new' }), h('span', { class: 'pill', text: (c.contacted || 0) + ' contacted' }), h('span', { class: 'pill', text: (c.won || 0) + ' won' }), h('span', { class: 'pill', text: items.length + ' total' }));
      var shown = items.filter(function (e) {
        if (state.status === 'all' && e.status === 'archived') return false;
        if (state.status !== 'all' && state.status !== 'every' && e.status !== state.status) return false;
        return !state.q || (e.name + ' ' + e.email + ' ' + e.phone + ' ' + e.message + ' ' + e.service).toLowerCase().indexOf(state.q) >= 0;
      });
      put(list, shown.length ? shown.map(card) : h('div', { class: 'empty' }, h('b', { text: items.length ? 'Nothing matches.' : 'No enquiries yet.' }), h('p', { text: items.length ? 'Change the filter or search.' : 'Enquiries from the Contact page appear here, and are also sent to Gmail and WhatsApp.' })));
    }
    function replace(updated) { items = items.map(function (e) { return e.id === updated.id ? updated : e; }); draw(); }
    function card(e) {
      var status = select('st-' + e.id, [['new', 'New'], ['contacted', 'Contacted'], ['won', 'Won'], ['closed', 'Closed'], ['archived', 'Archived']], e.status);
      status.addEventListener('change', function () { B.api('POST', '/api/admin/enquiries', { op: 'status', id: e.id, status: status.value }).then(function (r) { if (r.ok) replace(r.data.item); else status.value = e.status; }); });
      var notes = h('textarea', { id: 'nt-' + e.id, 'aria-label': 'Notes for ' + e.name, placeholder: 'Private notes' }); notes.value = e.notes || '';
      var saved = h('span', { class: 'mute', 'aria-live': 'polite', style: 'font-variant-numeric:normal' });
      var save = h('button', { type: 'button', class: 'btn line sm', text: 'Save notes', on: { click: function () { B.api('POST', '/api/admin/enquiries', { op: 'notes', id: e.id, notes: notes.value }).then(function (r) { saved.textContent = r.ok ? 'Saved.' : 'Could not save.'; }); } } });
      var wa = digits(e.phone).length >= 8 ? h('a', { class: 'btn wa sm', href: 'https://wa.me/' + digits(e.phone), target: '_blank', rel: 'noopener', text: 'Reply on WhatsApp' }) : null;
      var mail = e.email ? h('a', { class: 'btn line sm', href: 'mailto:' + e.email + '?subject=' + encodeURIComponent('Your enquiry to Barrister Multimedia'), text: 'Reply by email' }) : null;
      var resend = h('button', { type: 'button', class: 'btn line sm', text: 'Resend alerts', on: { click: function () { resend.disabled = true; B.api('POST', '/api/admin/enquiries', { op: 'resend', id: e.id }).then(function (r) { if (r.ok) replace(r.data.item); else resend.disabled = false; }); } } });
      var del = B.confirmBtn('Delete', 'Click again to delete', function () { B.api('POST', '/api/admin/enquiries', { op: 'delete', id: e.id }).then(function (r) { if (r.ok) { items = items.filter(function (x) { return x.id !== e.id; }); draw(); } }); });
      var n = e.notified || {};
      return h('article', { class: 'item', 'aria-label': 'Enquiry from ' + e.name },
        h('div', { class: 'item-head' }, h('h3', { text: e.name }), h('time', { datetime: new Date(e.createdAt).toISOString(), text: new Date(e.createdAt).toLocaleString() })),
        h('div', { class: 'kv' }, [['Service', e.service], ['Budget', e.budget], ['Delivery', e.timeline], ['Email', e.email], ['Phone', e.phone]].filter(function (x) { return x[1]; }).map(function (x) { return h('span', null, x[0] + ': ', h('b', { text: x[1] })); })),
        h('p', { class: 'text', text: e.message }),
        h('div', { class: 'acts' }, chip('Gmail', n.email), chip('WhatsApp', n.whatsapp), resend),
        h('div', { class: 'fld' }, h('label', { for: 'nt-' + e.id, text: 'Notes' }), notes),
        h('div', { class: 'acts' }, save, saved),
        h('div', { class: 'acts' }, h('label', { for: 'st-' + e.id, text: 'Status' }), status, wa, mail, del));
    }
    B.api('GET', '/api/admin/enquiries').then(function (r) { if (!guard(r)) return; if (!r.ok) return fail(p, r); items = r.data.items; draw(); });
  }

  /* ---------- staff ---------- */
  function genPassword() {
    var a = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789', out = '', buf = new Uint32Array(12);
    crypto.getRandomValues(buf); buf.forEach(function (n) { out += a[n % a.length]; }); return out;
  }
  function staff(p) {
    var items = [], list = h('div', { class: 'list' }), msg = h('div', { 'aria-live': 'polite' });
    var fn = input('sName', 'text', ''), fu = input('sUser', 'text', '', { autocapitalize: 'none', spellcheck: 'false' }), fr = input('sRole', 'text', ''), fp = input('sPhone', 'tel', ''), fw = input('sPass', 'text', '', { autocomplete: 'off' });
    var gen = h('button', { type: 'button', class: 'btn line sm', text: 'Generate', on: { click: function () { fw.value = genPassword(); } } });
    var add = h('form', { novalidate: true },
      h('div', { class: 'fgrid' }, field('Full name', fn), field('Username', fu, 'Letters, numbers, dots, dashes. They use this to sign in.'), field('Role', fr), field('Phone', fp),
        h('div', { class: 'fld wide' }, h('label', { for: 'sPass', text: 'Starting password' }), h('div', { style: 'display:flex;gap:.6rem;flex-wrap:wrap' }, h('div', { style: 'flex:1 1 14rem' }, fw), gen), h('span', { class: 'hint', text: 'At least 8 characters. Share it with the staff member; they can change it after signing in.' })),
        h('div', { class: 'fld wide' }, msg, h('button', { type: 'submit', class: 'btn', text: 'Add staff member' }))));
    add.addEventListener('submit', function (e) {
      e.preventDefault();
      B.api('POST', '/api/admin/staff', { op: 'create', name: fn.value, username: fu.value, role: fr.value, phone: fp.value, password: fw.value }).then(function (r) {
        if (!r.ok) return msg.replaceChildren(B.notice('bad', r.data.error || 'Could not add this person.'));
        msg.replaceChildren(B.notice('ok', fn.value + ' was added.', 'Username: ' + fu.value + '   Password: ' + fw.value + '. Share these with them now; the password is not shown again.'));
        fn.value = fu.value = fr.value = fp.value = fw.value = ''; load();
      });
    });
    p.replaceChildren(h('div', { class: 'panel' }, h('h2', { text: 'Add a staff member' }), add), h('h2', { text: 'Staff', style: 'margin-top:1.6rem' }), list);

    function row(s) {
      var n = input('n-' + s.username, 'text', s.name), r = input('r-' + s.username, 'text', s.role), ph = input('p-' + s.username, 'tel', s.phone), out = h('span', { class: 'mute', 'aria-live': 'polite', style: 'font-variant-numeric:normal' });
      var save = h('button', { type: 'button', class: 'btn line sm', text: 'Save details', on: { click: function () { B.api('POST', '/api/admin/staff', { op: 'update', username: s.username, name: n.value, role: r.value, phone: ph.value }).then(function (x) { out.textContent = x.ok ? 'Saved.' : (x.data.error || 'Could not save.'); }); } } });
      var toggle = h('button', { type: 'button', class: 'btn line sm', text: s.active ? 'Switch off access' : 'Switch on access', on: { click: function () { B.api('POST', '/api/admin/staff', { op: 'update', username: s.username, active: !s.active }).then(function (x) { if (x.ok) load(); }); } } });
      var np = input('w-' + s.username, 'text', '', { placeholder: 'New password', autocomplete: 'off' });
      var reset = h('button', { type: 'button', class: 'btn line sm', text: 'Reset password', on: { click: function () { B.api('POST', '/api/admin/staff', { op: 'reset', username: s.username, password: np.value }).then(function (x) { out.textContent = x.ok ? 'Password reset. Tell ' + s.name.split(' ')[0] + ' the new password.' : (x.data.error || 'Could not reset.'); if (x.ok) np.value = ''; }); } } });
      var del = B.confirmBtn('Delete', 'Click again to delete', function () { B.api('POST', '/api/admin/staff', { op: 'delete', username: s.username }).then(function (x) { if (x.ok) load(); }); });
      return h('article', { class: 'item', 'aria-label': s.name },
        h('div', { class: 'item-head' }, h('h3', { text: s.name }), h('span', { class: 'flag ' + (s.active ? 'ok' : 'warn'), text: (s.active ? 'Active' : 'Switched off') + ' · ' + s.username })),
        h('div', { class: 'fgrid' }, field('Name', n), field('Role', r), field('Phone', ph)),
        h('div', { class: 'acts' }, save, toggle, out),
        h('div', { class: 'fld' }, h('label', { for: 'w-' + s.username, text: 'Reset password' }), h('div', { style: 'display:flex;gap:.6rem;flex-wrap:wrap' }, h('div', { style: 'flex:1 1 12rem' }, np), reset)),
        h('div', { class: 'acts' }, del));
    }
    function load() {
      B.api('GET', '/api/admin/staff').then(function (r) {
        if (!guard(r)) return; if (!r.ok) return fail(p, r);
        items = r.data.items;
        put(list, items.length ? items.map(row) : h('div', { class: 'empty' }, h('b', { text: 'No staff yet.' }), h('p', { text: 'Add your first staff member above.' })));
      });
    }
    load();
  }

  /* ---------- attendance ---------- */
  function attendance(p) {
    var month = input('attMonth', 'month', B.dateKey(Date.now()).slice(0, 7)), who = select('attWho', [['', 'All staff']], '');
    var summary = h('div'), records = h('div'), pills = h('div', { class: 'grp' }), csv = h('a', { class: 'btn line sm', text: 'Download CSV', download: '' });
    var staffList = [], rows = [];
    p.replaceChildren(
      h('div', { class: 'toolbar', style: 'margin-top:0' }, pills, h('div', { class: 'grp' }, h('label', { for: 'attMonth', text: 'Month' }), month, h('label', { for: 'attWho', class: 'sr', text: 'Staff member' }), who, csv)),
      h('p', { class: 'sub', style: 'margin:.8rem 0 0;font-size:.9rem', text: 'Times are shown in this device’s time zone.' }),
      h('h2', { text: 'Daily summary', style: 'margin-top:1.4rem' }), summary,
      h('h2', { text: 'All records', style: 'margin-top:1.6rem' }), records,
      addPanel());

    function addPanel() {
      var s = select('mStaff', [], ''), type = select('mType', [['in', 'Clock in'], ['out', 'Clock out']], 'in'), at = input('mAt', 'datetime-local', B.toLocalInput(Date.now())), note = input('mNote', 'text', ''), msg = h('div', { 'aria-live': 'polite' });
      var form = h('form', { novalidate: true }, h('div', { class: 'fgrid' }, field('Staff member', s), field('Type', type), field('Date and time', at), field('Note', note, 'For example: forgot to clock out'),
        h('div', { class: 'fld wide' }, msg, h('button', { type: 'submit', class: 'btn', text: 'Add record' }))));
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        B.api('POST', '/api/admin/attendance', { op: 'add', username: s.value, type: type.value, at: new Date(at.value).getTime(), note: note.value }).then(function (r) {
          msg.replaceChildren(r.ok ? B.notice('ok', 'Record added.') : B.notice('bad', r.data.error || 'Could not add the record.')); if (r.ok) load();
        });
      });
      addPanel.sel = s;
      return h('div', { class: 'panel', style: 'margin-top:1.6rem' }, h('h2', { text: 'Add a record by hand' }), form);
    }

    function draw() {
      var visible = rows;
      var flagged = visible.filter(function (r) { return r.status === 'outside' || r.status === 'unverified'; }).length;
      pills.replaceChildren(h('span', { class: 'pill', text: visible.length + ' records' }), h('span', { class: 'pill' + (flagged ? ' hot' : ''), text: flagged + ' to review' }));
      csv.href = '/api/admin/export?type=attendance&month=' + encodeURIComponent(month.value);
      // summary per person per day
      var by = {}; visible.forEach(function (r) { (by[r.username] = by[r.username] || []).push(r); });
      var sum = [];
      Object.keys(by).forEach(function (u) { B.days(by[u]).forEach(function (d) { sum.push({ name: by[u][0].name, d: d }); }); });
      sum.sort(function (a, b) { return a.d.date < b.d.date ? 1 : a.d.date > b.d.date ? -1 : a.name.localeCompare(b.name); });
      summary.replaceChildren(sum.length ? table('Daily attendance summary for ' + month.value, ['Date', 'Staff', 'In', 'Out', 'Worked', 'Location'], sum.map(function (x) {
        return h('tr', null, h('td', { class: 'num', text: B.niceDate(x.d.date) }), h('td', { text: x.name }), h('td', { class: 'num', text: x.d.inAt ? B.timeStr(x.d.inAt) : '-' }), h('td', { class: 'num', text: x.d.open ? 'Still in' : (x.d.outAt ? B.timeStr(x.d.outAt) : '-') }), h('td', { class: 'num', text: x.d.ms ? B.dur(x.d.ms) : '-' }), h('td', null, B.flag(x.d.worst, x.d.dist)));
      })) : h('div', { class: 'empty' }, h('b', { text: 'No attendance for this month.' }), h('p', { text: 'Records appear here when staff clock in.' })));
      records.replaceChildren(visible.length ? table('Every clock-in and clock-out for ' + month.value, ['Date', 'Staff', 'Time', 'Type', 'Location', 'Note', 'Actions'], visible.map(recordRow)) : h('p', { class: 'sub', text: 'No records.' }));
    }
    function table(caption, heads, body) {
      return h('div', { class: 'tbl-wrap' }, h('table', { class: 't' }, h('caption', { class: 'sr', text: caption }), h('thead', null, h('tr', null, heads.map(function (x) { return h('th', { scope: 'col', text: x }); }))), h('tbody', null, body)));
    }
    function recordRow(r) {
      var tr = h('tr');
      function view() {
        tr.replaceChildren(
          h('td', { class: 'num', text: B.niceDate(r.date) }), h('td', { text: r.name }), h('td', { class: 'num', text: B.timeStr(r.at) }), h('td', { text: r.type === 'in' ? 'Clock in' : 'Clock out' }),
          h('td', null, B.flag(r.manual ? 'manual' : r.status, r.dist), r.lat != null ? h('a', { href: 'https://www.google.com/maps?q=' + r.lat + ',' + r.lng, target: '_blank', rel: 'noopener', style: 'margin-left:.5rem;font-size:.85rem', text: 'Map' }) : null),
          h('td', { text: (r.note || '') + (r.edited ? ' (edited)' : '') }),
          h('td', null, h('div', { class: 'acts', style: 'display:flex;gap:.4rem;flex-wrap:wrap' }, h('button', { type: 'button', class: 'btn line sm', text: 'Edit', 'aria-label': 'Edit record for ' + r.name + ' at ' + B.timeStr(r.at), on: { click: edit } }),
            B.confirmBtn('Delete', 'Sure?', function () { B.api('POST', '/api/admin/attendance', { op: 'delete', key: r.key }).then(function (x) { if (x.ok) load(); }); }))));
      }
      function edit() {
        var t = select('et-' + r.key, [['in', 'Clock in'], ['out', 'Clock out']], r.type), a = input('ea-' + r.key, 'datetime-local', B.toLocalInput(r.at)), n = input('en-' + r.key, 'text', r.note || '');
        t.setAttribute('aria-label', 'Type'); a.setAttribute('aria-label', 'Date and time'); n.setAttribute('aria-label', 'Note');
        tr.replaceChildren(h('td', { colspan: '2', text: r.name }), h('td', null, a), h('td', null, t), h('td', { text: '' }), h('td', null, n),
          h('td', null, h('div', { style: 'display:flex;gap:.4rem;flex-wrap:wrap' },
            h('button', { type: 'button', class: 'btn sm', text: 'Save', on: { click: function () { B.api('POST', '/api/admin/attendance', { op: 'update', key: r.key, type: t.value, at: new Date(a.value).getTime(), note: n.value }).then(function (x) { if (x.ok) load(); else a.setAttribute('aria-invalid', 'true'), a.title = x.data.error; }); } } }),
            h('button', { type: 'button', class: 'btn line sm', text: 'Cancel', on: { click: view } }))));
        a.focus();
      }
      view(); return tr;
    }
    function load() {
      var url = '/api/admin/attendance?month=' + encodeURIComponent(month.value) + (who.value ? '&staff=' + encodeURIComponent(who.value) : '');
      B.api('GET', url).then(function (r) { if (!guard(r)) return; if (!r.ok) return fail(p, r); rows = r.data.items; draw(); });
    }
    function fillStaff() {
      var keep = who.value; who.replaceChildren(h('option', { value: '', text: 'All staff' }));
      var m = addPanel.sel; m.replaceChildren();
      staffList.forEach(function (s) { who.appendChild(h('option', { value: s.username, text: s.name })); m.appendChild(h('option', { value: s.username, text: s.name })); });
      who.value = keep;
    }
    month.addEventListener('change', load); who.addEventListener('change', load);
    B.api('GET', '/api/admin/staff').then(function (r) { if (!guard(r)) return; if (r.ok) { staffList = r.data.items; fillStaff(); } load(); });
  }

  /* ---------- settings ---------- */
  function settings(p) {
    B.api('GET', '/api/admin/overview').then(function (r) {
      if (!guard(r)) return; if (!r.ok) { p.replaceChildren(); return fail(p, r); }
      var s = r.data.settings, msg = h('div', { 'aria-live': 'polite' });
      var name = input('stName', 'text', s.name), lat = input('stLat', 'text', s.lat == null ? '' : s.lat, { inputmode: 'decimal', placeholder: 'e.g. 5.603717' }), lng = input('stLng', 'text', s.lng == null ? '' : s.lng, { inputmode: 'decimal', placeholder: 'e.g. -0.186964' });
      var rad = input('stRad', 'text', s.radius, { inputmode: 'numeric' }), tz = input('stTz', 'text', s.timezone, { placeholder: 'e.g. Africa/Lagos' });
      var mode = select('stMode', [['flag', 'Allow and flag for review'], ['require', 'Block clock-in']], s.mode);
      var here = h('button', { type: 'button', class: 'btn line', text: 'Use my current location', on: { click: function () {
        msg.replaceChildren(h('p', { class: 'sub', text: 'Reading your location…' }));
        B.getPos().then(function (g) {
          if (g.err) return msg.replaceChildren(B.notice('warn', 'Your location could not be read.', 'Allow location for this site, or copy the coordinates from a map app.'));
          lat.value = g.lat.toFixed(6); lng.value = g.lng.toFixed(6); msg.replaceChildren(B.notice('ok', 'Filled in (accuracy about ' + Math.round(g.acc) + ' m).', 'Check the details, then save.'));
        });
      } } });
      var form = h('form', { novalidate: true }, h('div', { class: 'fgrid' },
        field('Site name', name, null, true), field('Latitude', lat), field('Longitude', lng), field('Allowed distance (metres)', rad, 'Between 20 and 5000.'),
        field('Studio time zone', tz, 'Used to decide which day a clock-in belongs to.'), field('When staff are outside the area', mode, null, true),
        h('div', { class: 'fld wide', style: 'display:flex;gap:.7rem;flex-wrap:wrap' }, h('button', { type: 'submit', class: 'btn', text: 'Save settings' }), here), h('div', { class: 'fld wide' }, msg)));
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        B.api('POST', '/api/admin/settings', { name: name.value, lat: lat.value, lng: lng.value, radius: rad.value, mode: mode.value, timezone: tz.value }).then(function (x) {
          msg.replaceChildren(x.ok ? B.notice('ok', 'Settings saved.', 'Staff see the new area the next time they open the attendance page.') : B.notice('bad', x.data.error || 'Could not save.'));
        });
      });
      p.replaceChildren(h('div', { class: 'form-wrap', style: 'margin-top:0' },
        h('div', { class: 'panel' }, h('h2', { text: 'Studio location and attendance' }), form),
        h('aside', { class: 'panel' }, h('h2', { text: 'How the check works' }), h('ul', { class: 'ticks' },
          h('li', { text: 'When staff clock in or out, their device location is sent to the server, which measures the distance to this point.' }),
          h('li', { text: 'Inside the allowed distance the record shows Verified.' }),
          h('li', { text: 'Outside it, or when location is unavailable, the record is flagged, or clock-in is blocked if you choose that.' }),
          h('li', { text: 'To find coordinates, press and hold the studio entrance in a map app and copy the two numbers.' })))));
    });
  }

  B.api('GET', '/api/session').then(function (r) { if (r.ok && r.data.user && r.data.user.role === 'admin') init(); else showLogin(); });
})();
