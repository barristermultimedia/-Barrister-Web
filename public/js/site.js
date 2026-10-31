(function () {
  'use strict';
  var S = window.SITE || {};
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function digits(v) { return String(v || '').replace(/[^\d]/g, ''); }
  function waLink(text) { var d = digits(S.whatsapp); return d.length >= 8 ? 'https://wa.me/' + d + (text ? '?text=' + encodeURIComponent(text) : '') : ''; }
  function store(op, k, v) { try { if (op === 'set') sessionStorage.setItem(k, v); else if (op === 'del') sessionStorage.removeItem(k); else return sessionStorage.getItem(k); } catch (e) {} return null; }

  /* ---- contact details from config.js ---- */
  $$('[data-site]').forEach(function (el) {
    var k = el.getAttribute('data-site');
    if (k === 'email' && S.email) { el.textContent = S.email; if (el.tagName === 'A') el.href = 'mailto:' + S.email; }
    if (k === 'phone' && S.phone) { el.textContent = S.phone; if (el.tagName === 'A') el.href = 'tel:' + S.phone.replace(/[^\d+]/g, ''); }
  });
  $$('[data-wa]').forEach(function (el) {
    var href = waLink(el.getAttribute('data-wa'));
    if (href) { el.href = href; el.hidden = false; el.target = '_blank'; el.rel = 'noopener'; } else el.hidden = true;
  });

  /* ---- navigation menu on small screens ---- */
  var nav = $('.nav'), btn = $('.menu-btn');
  if (nav && btn) {
    function set(open) { nav.classList.toggle('open', open); btn.setAttribute('aria-expanded', open ? 'true' : 'false'); btn.textContent = open ? 'Close' : 'Menu'; }
    btn.addEventListener('click', function () { set(!nav.classList.contains('open')); });
    nav.addEventListener('keydown', function (e) { if (e.key === 'Escape' && nav.classList.contains('open')) { set(false); btn.focus(); } });
  }

  /* ---- home quote bar sends choices to the contact form ---- */
  var quick = $('#quickForm');
  if (quick) quick.addEventListener('submit', function (e) {
    e.preventDefault();
    store('set', 'bm-quick', JSON.stringify({ service: $('#qService').value, timeline: $('#qTime').value }));
    window.location.href = 'contact.html';
  });

  /* ---- portfolio filter ---- */
  var filters = $$('.filters button');
  if (filters.length) {
    var live = $('#filterStatus');
    filters.forEach(function (b) {
      b.addEventListener('click', function () {
        filters.forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
        var f = b.getAttribute('data-filter'), n = 0;
        $$('.card[data-cat]').forEach(function (c) { var show = f === 'all' || c.getAttribute('data-cat') === f; c.hidden = !show; if (show) n++; });
        if (live) live.textContent = 'Showing ' + n + ' exhibit' + (n === 1 ? '' : 's') + '.';
      });
    });
  }

  /* ---- enquiry form ---- */
  var form = $('#enquiry');
  if (form) {
    var status = $('#formStatus');
    var fields = ['name', 'email', 'phone', 'message'];
    var params = new URLSearchParams(location.search);
    function say(kind, title, text, actions) {
      status.replaceChildren();
      var box = document.createElement('div'); box.className = 'notice ' + kind;
      var b = document.createElement('b'); b.textContent = title; box.appendChild(b);
      if (text) { var p = document.createElement('p'); p.textContent = text; box.appendChild(p); }
      if (actions && actions.length) { var a = document.createElement('div'); a.className = 'acts'; actions.forEach(function (x) { a.appendChild(x); }); box.appendChild(a); }
      status.appendChild(box); status.focus();
    }
    function link(label, href, cls) { var a = document.createElement('a'); a.className = 'btn sm ' + (cls || 'line'); a.textContent = label; a.href = href; if (/^https/.test(href)) { a.target = '_blank'; a.rel = 'noopener'; } return a; }
    function setErr(id, msg) {
      var e = $('#e-' + id), i = $('#' + id); if (!e || !i) return;
      e.textContent = msg || ''; if (msg) i.setAttribute('aria-invalid', 'true'); else i.removeAttribute('aria-invalid');
    }
    function summary(d) {
      return 'Hello Barrister Multimedia, I am ' + d.name + '.\nService: ' + d.service + '\nDelivery: ' + d.timeline + '\n\n' + d.message;
    }
    if (params.get('sent')) say('ok', 'Thank you. Your enquiry has been sent.', 'We reply within one working day.');
    if (params.get('error')) say('bad', 'Your enquiry could not be sent.', 'Please check the form and try again.');
    try {
      var pre = JSON.parse(store('get', 'bm-quick') || 'null');
      if (pre) { if (pre.service) $('#service').value = pre.service; if (pre.timeline) $('#timeline').value = pre.timeline; }
    } catch (e) {}

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var d = {
        name: $('#name').value.trim(), email: $('#email').value.trim(), phone: $('#phone').value.trim(),
        service: $('#service').value, budget: $('#budget').value, timeline: $('#timeline').value,
        message: $('#message').value.trim(), website: form.elements.website.value
      };
      var bad = {};
      if (!d.name) bad.name = 'Enter your name.';
      if (d.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) bad.email = 'Check the email address.';
      if (!d.email && !d.phone) bad.phone = 'Add an email or a phone number.';
      if (!d.message) bad.message = 'Tell us a little about the project.';
      fields.forEach(function (f) { setErr(f, bad[f]); });
      var first = fields.filter(function (f) { return bad[f]; })[0];
      if (first) { say('bad', 'Please fix ' + Object.keys(bad).length + (Object.keys(bad).length === 1 ? ' thing' : ' things') + ' and send again.', Object.keys(bad).map(function (k) { return bad[k]; }).join(' ')); $('#' + first).focus(); return; }

      var send = $('#send'); send.disabled = true; send.textContent = 'Sending';
      status.replaceChildren();
      fetch('/api/enquiry', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(d) })
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, status: r.status, j: j }; }); })
        .then(function (res) {
          if (res.ok) {
            var acts = []; var wa = waLink(summary(d));
            if (wa) acts.push(link('Also send this on WhatsApp', wa, 'wa'));
            say('ok', 'Thank you, ' + d.name.split(' ')[0] + '. Your enquiry has been sent.', 'We reply within one working day.', acts);
            form.reset(); store('del', 'bm-quick');
          } else if (res.status === 422 && res.j.problems) {
            fields.forEach(function (f) { setErr(f, res.j.problems[f]); });
            say('bad', 'Please check the form.', Object.keys(res.j.problems).map(function (k) { return res.j.problems[k]; }).join(' '));
          } else {
            say('bad', res.j.error || 'Your enquiry could not be sent.', 'You can also reach us directly.', fallbackActions(d));
          }
        })
        .catch(function () { say('bad', 'You seem to be offline.', 'Your message was not sent. Try again, or reach us directly.', fallbackActions(d)); })
        .then(function () { send.disabled = false; send.textContent = 'Send enquiry'; });
    });
    function fallbackActions(d) {
      var a = [], wa = waLink(summary(d));
      if (wa) a.push(link('Send on WhatsApp', wa, 'wa'));
      if (S.email) a.push(link('Send by email', 'mailto:' + S.email + '?subject=' + encodeURIComponent('Enquiry: ' + d.service) + '&body=' + encodeURIComponent(summary(d))));
      return a;
    }
  }
})();
