/* Accessible media players: skip back/forward, play/pause, mute, captions on/off, pause others. */
(function () {
  'use strict';
  var players = Array.prototype.slice.call(document.querySelectorAll('.player'));
  var all = [];
  function fmt(t) { t = Math.max(0, Math.floor(t || 0)); return Math.floor(t / 60) + ':' + ('0' + (t % 60)).slice(-2); }
  players.forEach(function (p) {
    var m = p.querySelector('video, audio'), bar = p.querySelector('.player-bar');
    if (!m || !bar) return;
    all.push(m);
    var status = bar.querySelector('.status');
    var track = m.textTracks && m.textTracks.length ? m.textTracks[0] : null;
    if (track) track.mode = 'showing';
    function act(name) { return bar.querySelector('[data-act="' + name + '"]'); }
    function say(t) { if (status) status.textContent = t; }
    var play = act('play'), mute = act('mute'), cc = act('cc');
    function paintPlay() { if (play) { play.textContent = m.paused ? 'Play' : 'Pause'; play.setAttribute('aria-pressed', m.paused ? 'false' : 'true'); } }
    function paintMute() { if (mute) { mute.textContent = m.muted ? 'Unmute' : 'Mute'; mute.setAttribute('aria-pressed', m.muted ? 'true' : 'false'); } }
    function paintCc() { if (cc && track) { var on = track.mode === 'showing'; cc.textContent = on ? 'Captions on' : 'Captions off'; cc.setAttribute('aria-pressed', on ? 'true' : 'false'); } }
    if (!track && cc) cc.hidden = true;
    bar.hidden = false;
    bar.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-act]'); if (!b) return;
      var a = b.getAttribute('data-act');
      if (a === 'back') { m.currentTime = Math.max(0, m.currentTime - 10); say('Back 10 seconds. ' + fmt(m.currentTime) + ' of ' + fmt(m.duration)); }
      if (a === 'fwd') { m.currentTime = Math.min(m.duration || 1e9, m.currentTime + 10); say('Forward 10 seconds. ' + fmt(m.currentTime) + ' of ' + fmt(m.duration)); }
      if (a === 'play') { if (m.paused) { var pr = m.play(); if (pr && pr.catch) pr.catch(function () { say('Playback could not start.'); }); say('Playing.'); } else { m.pause(); say('Paused.'); } }
      if (a === 'mute') { m.muted = !m.muted; say(m.muted ? 'Muted.' : 'Sound on.'); }
      if (a === 'cc' && track) { track.mode = track.mode === 'showing' ? 'hidden' : 'showing'; say(track.mode === 'showing' ? 'Captions on.' : 'Captions off.'); paintCc(); }
    });
    m.addEventListener('play', function () { paintPlay(); all.forEach(function (o) { if (o !== m && !o.paused) o.pause(); }); });
    m.addEventListener('pause', paintPlay);
    m.addEventListener('volumechange', paintMute);
    paintPlay(); paintMute(); paintCc();
  });
})();
