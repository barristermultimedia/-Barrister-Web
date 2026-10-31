/* Staff sign-in page. */
(function () {
  'use strict';
  var B = window.BM, h = B.h, app = B.$('#app');
  function signedIn(u) {
    app.replaceChildren(
      B.notice('ok', 'Signed in as ' + u.name + '.', u.role === 'admin' ? 'You are signed in as the administrator.' : 'You can record your attendance.'),
      h('div', { class: 'acts', style: 'display:flex;gap:.7rem;flex-wrap:wrap;margin-top:1.2rem' },
        h('a', { class: 'btn', href: u.role === 'admin' ? 'admin.html' : 'attendance.html', text: u.role === 'admin' ? 'Open the admin page' : 'Go to attendance' }),
        h('button', { type: 'button', class: 'btn line', text: 'Sign out', on: { click: function () { B.api('POST', '/api/logout', {}).then(showForm); } } })));
  }
  function showForm() {
    app.replaceChildren(B.loginForm({ onSuccess: function (d) { window.location.href = d.redirect; } }));
  }
  B.api('GET', '/api/session').then(function (r) {
    if (r.ok && r.data.user) signedIn(r.data.user); else showForm();
  });
})();
