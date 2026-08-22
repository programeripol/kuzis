/* Kužiš — shared mobile header/nav behavior.
   Loaded on every page. Handles:
   - --kz-header-h CSS var (so the mobile menu panel starts exactly below
     the real header, on any page)
   - scroll lock while the mobile menu is open (position:fixed body trick —
     plain overflow:hidden on body is not reliable on iOS Safari)
   Edit ONLY this file to change menu open/close behavior site-wide.

   Note: several pages are rendered by an async template runtime (x-dc /
   sc-for components) that can (re)build the <header> markup — including
   replacing the #kz-nav-toggle checkbox node — AFTER this script's
   DOMContentLoaded handler first runs. Two things below exist specifically
   to survive that:
   1. setHeaderHeightVar() never writes a 0px value (0 just means "header
      isn't painted yet", not "header is 0px tall"), and it keeps retrying
      + watches DOM mutations until it gets a real measurement.
   2. The scroll-lock toggle listener is bound on `document` via event
      delegation instead of on the checkbox element directly, so it keeps
      working even if the template runtime swaps in a new checkbox node. */
(function () {
  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  ready(function () {
    function setHeaderHeightVar() {
      var header = document.querySelector('header');
      if (header && header.offsetHeight > 0) {
        document.documentElement.style.setProperty('--kz-header-h', header.offsetHeight + 'px');
      }
      // If header is missing or still 0px tall, leave the var alone so the
      // safe CSS fallback (var(--kz-header-h,72px)) keeps applying.
    }

    setHeaderHeightVar();
    window.addEventListener('load', setHeaderHeightVar);
    window.addEventListener('resize', setHeaderHeightVar);

    // Retry for ~2s in case the header is still being rendered by the
    // template runtime when this script first runs.
    var attempts = 0;
    var retryTimer = setInterval(function () {
      attempts++;
      setHeaderHeightVar();
      if (attempts >= 20) clearInterval(retryTimer);
    }, 100);

    // Also react to late DOM changes (e.g. the template runtime inserting
    // the real header content after an initial empty/placeholder render).
    if (window.MutationObserver) {
      var mo = new MutationObserver(function () { setHeaderHeightVar(); });
      mo.observe(document.documentElement, { childList: true, subtree: true });
      setTimeout(function () { mo.disconnect(); }, 5000);
    }

    var lockedScrollY = 0;
    var isLocked = false;

    function lockScroll() {
      if (isLocked) return;
      isLocked = true;
      lockedScrollY = window.scrollY || window.pageYOffset || 0;
      var body = document.body;
      body.style.position = 'fixed';
      body.style.top = (-lockedScrollY) + 'px';
      body.style.left = '0';
      body.style.right = '0';
      body.style.width = '100%';
    }

    function unlockScroll() {
      if (!isLocked) return;
      isLocked = false;
      var body = document.body;
      body.style.position = '';
      body.style.top = '';
      body.style.left = '';
      body.style.right = '';
      body.style.width = '';
      window.scrollTo(0, lockedScrollY);
    }

    // Delegated listener: survives the toggle checkbox being re-rendered
    // (replaced with a new node) by the page's template runtime after this
    // script first ran — binding directly to the original node would get
    // silently orphaned in that case.
    document.addEventListener('change', function (e) {
      var t = e.target;
      if (!t || t.id !== 'kz-nav-toggle') return;
      if (t.checked) lockScroll();
      else unlockScroll();
    });

    // If the user hits back/forward into a bfcache'd page with the menu
    // still visually open, make sure state is consistent on show.
    window.addEventListener('pageshow', function () {
      var toggle = document.getElementById('kz-nav-toggle');
      if (toggle && !toggle.checked) unlockScroll();
    });
  });
})();

/* Kužiš — newsletter: footer prijava + interaktivni pop-up (kviz).
   Živi ovdje jer se nav-behavior.js učitava na SVIM stranicama, pa jedan
   edit pokriva cijeli sajt. Pop-up se pokaže jednom; kad ga korisnik
   zatvori (X) ili se prijavi, localStorage pamti i više se ne pojavljuje. */
(function () {
  var ML = 'https://assets.mailerlite.com/jsonp/2532018/forms/194591584556156410/subscribe';
  var K_CLOSED = 'kzNlClosed';
  var K_DONE = 'kzNlDone';
  var DELAY = 26000;
  var SCROLL_AT = 0.5;

  function ls(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { window.localStorage.setItem(k, v); } catch (e) {} }

  function subscribe(email, name) {
    var fd = new FormData();
    fd.append('fields[email]', email);
    if (name) fd.append('fields[name]', name);
    lsSet(K_DONE, '1');
    return fetch(ML, { method: 'POST', body: fd }).catch(function () {});
  }

  /* ---------- styles ---------- */
  function styles() {
    if (document.getElementById('kz-nl-css')) return;
    var s = document.createElement('style');
    s.id = 'kz-nl-css';
    s.textContent = [
      '.kz-nl-ov{position:fixed;inset:0;z-index:100000;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(23,18,15,.55);opacity:0;transition:opacity .35s ease}',
      '.kz-nl-ov.on{opacity:1}',
      '.kz-nl-card{position:relative;width:100%;max-width:430px;background:#fff;border:3px solid #171412;border-radius:30px 26px 32px 24px;box-shadow:9px 9px 0 #FFD048;padding:28px 26px 24px;box-sizing:border-box;transform:scale(.86) rotate(-2.5deg);opacity:0;transition:transform .45s cubic-bezier(.34,1.56,.64,1),opacity .3s ease;font-family:Inter,system-ui,sans-serif}',
      '.kz-nl-ov.on .kz-nl-card{transform:scale(1) rotate(-1deg);opacity:1}',
      '.kz-nl-x{position:absolute;top:-14px;right:-14px;width:38px;height:38px;border-radius:50%;background:#fff;border:3px solid #171412;font:800 17px/1 Inter;color:#171412;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;transition:transform .18s ease,background .18s ease}',
      '.kz-nl-x:hover{background:#FFD048;transform:rotate(90deg)}',
      '.kz-nl-kicker{display:inline-block;font:800 11.5px Inter;letter-spacing:.1em;text-transform:uppercase;background:#FFD048;border:2px solid #171412;border-radius:100px;padding:3px 11px;margin-bottom:12px}',
      '.kz-nl-h{margin:0 0 6px;font-family:"Baloo 2",Inter,sans-serif;font-weight:800;font-size:26px;line-height:1.12;color:#171412;letter-spacing:-.01em}',
      '.kz-nl-p{margin:0 0 16px;font:400 14px/1.55 Inter;color:rgba(23,18,15,.66)}',
      '.kz-nl-opt{display:block;width:100%;text-align:left;background:#fff;border:2.5px solid #171412;border-radius:16px 20px 14px 18px;padding:12px 14px;margin-bottom:10px;font:600 14.5px Inter;color:#171412;cursor:pointer;transition:transform .16s ease,background .16s ease,box-shadow .16s ease}',
      '.kz-nl-opt:hover{background:#FFD048;transform:translate(-2px,-2px) rotate(-.6deg);box-shadow:4px 4px 0 #171412}',
      '.kz-nl-dots{display:flex;gap:7px;margin-bottom:14px}',
      '.kz-nl-dot{width:11px;height:11px;border-radius:50%;border:2.5px solid #171412;background:#fff;transition:background .25s ease}',
      '.kz-nl-dot.on{background:#FFD048}',
      '.kz-nl-form{display:flex;gap:8px;flex-wrap:wrap;margin-top:4px}',
      '.kz-nl-in{flex:1;min-width:170px;box-sizing:border-box;padding:12px 14px;border:2.5px solid #171412;border-radius:14px 16px 12px 15px;font:400 14.5px Inter;outline:none}',
      '.kz-nl-in:focus{box-shadow:3px 3px 0 #FFD048}',
      '.kz-nl-go{padding:12px 20px;background:#FFD048;color:#171412;border:2.5px solid #171412;border-radius:14px 16px 12px 15px;font:700 14.5px Inter;cursor:pointer;transition:transform .16s ease,box-shadow .16s ease}',
      '.kz-nl-go:hover{transform:translate(-2px,-2px);box-shadow:4px 4px 0 #171412}',
      '.kz-nl-fine{margin:10px 0 0;font:400 12px/1.5 Inter;color:rgba(23,18,15,.5)}',
      '.kz-nl-fine a{color:#171412;font-weight:600}',
      '.kz-nl-cv{display:block;width:100%;height:auto;border:2.5px solid #171412;border-radius:16px 20px 14px 18px;background:#FFFCF2;cursor:pointer;touch-action:manipulation}',
      '.kz-nl-jump{display:block;width:100%;margin-top:12px;padding:16px;background:#FFD048;color:#171412;border:2.5px solid #171412;border-radius:16px 20px 14px 18px;font:800 17px Inter;letter-spacing:.08em;cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent}',
      '.kz-nl-jump:active{transform:translate(2px,2px)}',
      '.kz-nl-doodle{position:absolute;pointer-events:none}',
      '@media(max-width:520px){.kz-nl-card{padding:24px 20px 20px;border-radius:24px}.kz-nl-h{font-size:22px}}',
      '.kz-fnl{max-width:1120px;margin:0 auto 34px;padding:22px 24px;border:2.5px dashed rgba(255,255,255,.35);border-radius:22px 26px 20px 24px;display:flex;flex-wrap:wrap;gap:16px;align-items:center;justify-content:space-between}',
      '.kz-fnl-t{font-family:"Baloo 2",Inter,sans-serif;font-weight:800;font-size:19px;color:#fff;margin:0 0 4px}',
      '.kz-fnl-s{margin:0;font:400 13.5px/1.5 Inter;color:rgba(255,255,255,.6)}',
      '.kz-fnl form{display:flex;gap:8px;flex-wrap:wrap}',
      '.kz-fnl input{box-sizing:border-box;padding:11px 14px;border:none;border-radius:10px;font:400 14px Inter;outline:none;min-width:190px}',
      '.kz-fnl button{padding:11px 20px;background:#FFD048;color:#171412;border:none;border-radius:10px;font:700 14px Inter;cursor:pointer;transition:transform .2s ease}',
      '.kz-fnl button:hover{transform:translateY(-2px)}',
      '.kz-fnl-ok{font:600 14px Inter;color:#FFD048}',
      '.kz-fnl-right{display:flex;flex-direction:column;gap:9px;align-items:flex-end}',
      '.kz-fnl-play{background:none;border:none;color:#FFD048;font:600 13px Inter;cursor:pointer;padding:0;text-decoration:underline;text-underline-offset:3px}',
      '.kz-fnl-playbig{background:#FFD048;color:#171412;border:2.5px solid #171412;border-radius:14px 16px 12px 15px;padding:12px 22px;font:700 14.5px Inter;text-decoration:none;cursor:pointer;transition:transform .18s ease,box-shadow .18s ease}',
      '.kz-fnl-playbig:hover{transform:translate(-2px,-2px);box-shadow:4px 4px 0 rgba(255,255,255,.35)}'
    ].join('\n');
    document.head.appendChild(s);
  }

  /* ---------- footer form ---------- */
  function hasNlSection() {
    var secs = document.querySelectorAll('section');
    for (var q = 0; q < secs.length; q++) {
      if (!secs[q].querySelector('input[type="email"]')) continue;
      var tx = (secs[q].innerText || '').toLowerCase();
      if (tx.indexOf('newsletter') >= 0 || tx.indexOf('ne propustite') >= 0 || tx.indexOf('inbox') >= 0) return true;
    }
    return false;
  }
  function footerForm() {
    var f = document.querySelector('footer');
    if (!f || f.querySelector('.kz-fnl')) return;
    styles();
    var slim = hasNlSection() || !!f.querySelector('input[type="email"]');
    var box = document.createElement('div');
    box.className = 'kz-fnl';
    if (slim) {
      box.innerHTML =
        '<div><p class="kz-fnl-t">Kužiš newsletter</p>' +
        '<p class="kz-fnl-s">Preskoči prepreke pa se prijavi - traje dvadeset sekundi.</p></div>' +
        '<button type="button" class="kz-fnl-play kz-fnl-playbig">Igraj i prijavi se</button>';
    } else {
      box.innerHTML =
        '<div><p class="kz-fnl-t">Kužiš newsletter</p>' +
        '<p class="kz-fnl-s">Jednom mjesečno: konkretni trikovi za Canvu, Excel i web. Bez zatrpavanja inboxa.</p></div>' +
        '<div class="kz-fnl-right"><form novalidate><input type="email" required placeholder="vasa@email.com" aria-label="Email adresa">' +
        '<button type="submit">Prijavi me</button></form>' +
        '<button type="button" class="kz-fnl-play">ili odigraj igricu</button></div>';
    }
    var grid = f.querySelector('.footer-grid');
    if (grid && grid.parentNode) grid.parentNode.insertBefore(box, grid.nextSibling);
    else f.insertBefore(box, f.firstChild);
    var play = box.querySelector('.kz-fnl-play');
    if (play) play.addEventListener('click', function () { popup(true); });
    var form = box.querySelector('form');
    if (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var v = form.querySelector('input').value.trim();
        if (!v || v.indexOf('@') < 0) return;
        subscribe(v);
        form.outerHTML = '<div class="kz-fnl-ok">Hvala! Provjerite inbox za potvrdu prijave.</div>';
      });
    }
  }

  /* ---------- pop-up: mini igrica ---------- */
  function popup(force) {
    if (!force && (ls(K_CLOSED) || ls(K_DONE))) return;
    if (document.querySelector('.kz-nl-ov')) return;
    styles();
    var ov = document.createElement('div');
    ov.className = 'kz-nl-ov';
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-label', 'Kužiš newsletter');
    var card = document.createElement('div');
    card.className = 'kz-nl-card';
    ov.appendChild(card);
    document.body.appendChild(ov);
    requestAnimationFrame(function () { ov.classList.add('on'); });

    var raf = null, keyH = null;

    function close(flag) {
      lsSet(flag || K_CLOSED, '1');
      if (raf) cancelAnimationFrame(raf);
      if (keyH) window.removeEventListener('keydown', keyH);
      ov.classList.remove('on');
      setTimeout(function () { if (ov.parentNode) ov.parentNode.removeChild(ov); }, 350);
    }

    function xBtn() {
      var b = card.querySelector('.kz-nl-x');
      if (b) b.addEventListener('click', function () { close(K_CLOSED); });
    }

    /* ---- korak 2: mail ---- */
    function showForm(score) {
      if (raf) cancelAnimationFrame(raf);
      raf = null;
      var praise = score >= 12 ? 'Ozbiljno dobro.' : (score >= 6 ? 'Solidno!' : 'Idemo ponovo?');
      card.innerHTML =
        '<button class="kz-nl-x" aria-label="Zatvori">&times;</button>' +
        '<div class="kz-nl-kicker">Skor: ' + score + '</div>' +
        '<h3 class="kz-nl-h">' + praise + '</h3>' +
        '<p class="kz-nl-p">Ovako preskačemo i sve ostalo što vam krade vrijeme. Jednom mjesečno šaljemo konkretne trikove za Canvu, Excel i web - bez zatrpavanja inboxa.</p>' +
        '<form class="kz-nl-form" novalidate><input class="kz-nl-in" type="email" required placeholder="vasa@email.com" aria-label="Email adresa">' +
        '<button class="kz-nl-go" type="submit">Šalji</button></form>' +
        '<p class="kz-nl-fine"><a href="#" class="kz-nl-again">Igraj još jednom</a> &nbsp;·&nbsp; Bez zatrpavanja inboxa, odjava jednim klikom.</p>';
      xBtn();
      var again = card.querySelector('.kz-nl-again');
      again.addEventListener('click', function (e) { e.preventDefault(); showGame(); });
      var form = card.querySelector('form');
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var v = form.querySelector('input').value.trim();
        if (!v || v.indexOf('@') < 0) return;
        subscribe(v);
        card.innerHTML =
          '<button class="kz-nl-x" aria-label="Zatvori">&times;</button>' +
          '<div class="kz-nl-kicker">Gotovo</div>' +
          '<h3 class="kz-nl-h">Hvala! Provjeri inbox.</h3>' +
          '<p class="kz-nl-p">Poslali smo ti mail za potvrdu prijave - klikni i to je to.</p>';
        xBtn();
        setTimeout(function () { close(K_DONE); }, 2600);
      });
    }

    /* ---- korak 1: igrica ---- */
    function showGame() {
      var TOUCH = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
      var MOB = Math.min(window.innerWidth || 9999, document.documentElement.clientWidth || 9999) < 640;
      var W = MOB ? 420 : 760, H = 320;
      var GND = 252, R = MOB ? 27 : 30, PX = MOB ? 78 : 116;

      card.innerHTML =
        '<button class="kz-nl-x" aria-label="Zatvori">&times;</button>' +
        '<div class="kz-nl-kicker">Pauza od posla</div>' +
        '<h3 class="kz-nl-h">Preskoči prepreke</h3>' +
        '<p class="kz-nl-p">' + (TOUCH ? 'Tapni za skok. Klackalica, feder i kosina te izbace uvis.' : 'Klik ili razmaknica za skok. Klackalica, feder i kosina te izbace uvis.') + '</p>' +
        '<canvas class="kz-nl-cv" width="' + W + '" height="' + H + '"></canvas>' +
        (TOUCH ? '<button type="button" class="kz-nl-jump">SKOK</button>' : '') +
        '<p class="kz-nl-fine"><a href="#" class="kz-nl-skip">Preskoči igru i prijavi se na novosti</a></p>';
      xBtn();
      card.querySelector('.kz-nl-skip').addEventListener('click', function (e) { e.preventDefault(); showForm(0); });

      var cv = card.querySelector('.kz-nl-cv');
      var ctx = cv.getContext('2d');
      var TAU = Math.PI * 2;
      var G = 0.92, JUMP = 14.6;

      /* kind: 'o' = prepreka (smrtonosna), 'l' = katapult (izbaci uvis) */
      var DEF = {
        drvo: { kind: 'o', w: 56, h: 64, hit: 60 },
        grmic: { kind: 'o', w: 68, h: 40, hit: 38 },
        oblacic: { kind: 'o', w: 76, h: 46, hit: 44 },
        kosina: { kind: 'l', w: 72, h: 42, pow: 16.0 },
        klackalica: { kind: 'l', w: 92, h: 46, pow: 17.0 },
        feder: { kind: 'l', w: 46, h: 50, pow: 18.0 }
      };
      var SEQ = ['drvo', 'feder', 'grmic', 'klackalica', 'oblacic', 'kosina'];

      var st = { y: 0, v: 0, run: false, over: false, score: 0, sp: 5, t: 0, n: 0, obs: [], next: 120, land: 0 };

      function jump() {
        if (st.over) return;
        if (!st.run) { st.run = true; loop(); return; }
        if (st.y <= 1) { st.v = JUMP; }
      }
      cv.addEventListener('mousedown', function (e) { e.preventDefault(); jump(); });
      cv.addEventListener('touchstart', function (e) { e.preventDefault(); jump(); }, { passive: false });
      var jb = card.querySelector('.kz-nl-jump');
      if (jb) {
        jb.addEventListener('touchstart', function (e) { e.preventDefault(); jump(); }, { passive: false });
        jb.addEventListener('click', function (e) { e.preventDefault(); jump(); });
      }
      keyH = function (e) {
        if (e.key === ' ' || e.code === 'Space' || e.key === 'ArrowUp') { e.preventDefault(); jump(); }
        if (e.key === 'Escape') close(K_CLOSED);
      };
      window.addEventListener('keydown', keyH);

      /* --- crtaci --- */
      function rr(x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
      }
      function fs(col) {
        ctx.fillStyle = col; ctx.fill();
        ctx.lineWidth = 4.5; ctx.lineJoin = 'round'; ctx.strokeStyle = '#171412'; ctx.stroke();
      }
      /* spoji vise krugova/pravokutnika u JEDAN oblik bez unutarnjih crta:
         prvo debeli obrub svima, pa ispune preko njega */
      function shape(parts, col) {
        function path(p) {
          if (p.length === 3) { ctx.beginPath(); ctx.arc(p[0], p[1], p[2], 0, TAU); }
          else { rr(p[0], p[1], p[2], p[3], p[4]); }
        }
        ctx.strokeStyle = '#171412'; ctx.lineWidth = 9; ctx.lineJoin = 'round';
        for (var i = 0; i < parts.length; i++) { path(parts[i]); ctx.stroke(); }
        ctx.fillStyle = col;
        for (var k = 0; k < parts.length; k++) { path(parts[k]); ctx.fill(); }
      }
      function eye(ex, ey, rx, ry) {
        ctx.fillStyle = '#171412';
        ctx.beginPath(); ctx.ellipse(ex, ey, rx, ry, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath(); ctx.arc(ex + rx * 0.28, ey - ry * 0.32, rx * 0.50, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.arc(ex - rx * 0.46, ey + ry * 0.46, rx * 0.21, 0, TAU); ctx.fill();
      }
      function ball(x, y, r, sq, dead) {
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(1 + sq, 1 - sq);
        ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); fs('#FFD048');
        if (dead) {
          ctx.strokeStyle = '#171412'; ctx.lineWidth = 4.2; ctx.lineCap = 'round';
          for (var s2 = -1; s2 <= 1; s2 += 2) {
            var ex = s2 * r * 0.33, ey = -r * 0.04, q = r * 0.18;
            ctx.beginPath();
            ctx.moveTo(ex - q, ey - q); ctx.lineTo(ex + q, ey + q);
            ctx.moveTo(ex + q, ey - q); ctx.lineTo(ex - q, ey + q);
            ctx.stroke();
          }
        } else {
          eye(-r * 0.34, -r * 0.04, r * 0.235, r * 0.30);
          eye(r * 0.34, -r * 0.04, r * 0.235, r * 0.30);
        }
        ctx.restore();
      }
      function drawObs(o) {
        var b = GND, cx = o.x + o.w / 2;
        var a = o.fired ? Math.min(1, o.a / 13) : 0;
        if (o.t === 'drvo') {
          rr(cx - 9, b - 30, 18, 30, 6); fs('#D97757');
          shape([[cx - 15, b - 44, 19], [cx + 15, b - 46, 19], [cx, b - 58, 23]], '#9FC58C');
        } else if (o.t === 'grmic') {
          shape([[cx - 20, b - 15, 17], [cx + 20, b - 14, 16], [cx, b - 24, 20]], '#9FC58C');
        } else if (o.t === 'oblacic') {
          shape([[cx - 22, b - 16, 16], [cx + 22, b - 17, 15], [cx - 2, b - 27, 20],
          [cx - 30, b - 20, 60, 20, 10]], '#8ECAE6');
        } else if (o.t === 'kosina') {
          var pu = Math.sin(a * Math.PI) * 0.16;
          ctx.save(); ctx.translate(cx, b); ctx.scale(1, 1 + pu); ctx.translate(-cx, -b);
          ctx.beginPath();
          ctx.moveTo(o.x, b);
          ctx.quadraticCurveTo(o.x + o.w * 0.55, b - o.h * 0.26, o.x + o.w - 13, b - o.h);
          ctx.quadraticCurveTo(o.x + o.w, b - o.h - 3, o.x + o.w, b - o.h + 15);
          ctx.lineTo(o.x + o.w, b);
          ctx.closePath();
          fs('#8ECAE6');
          ctx.strokeStyle = 'rgba(23,20,18,.32)'; ctx.lineWidth = 3; ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(o.x + o.w * 0.34, b - 7); ctx.lineTo(o.x + o.w * 0.60, b - o.h * 0.44);
          ctx.moveTo(o.x + o.w * 0.52, b - 7); ctx.lineTo(o.x + o.w * 0.74, b - o.h * 0.50);
          ctx.stroke();
          ctx.restore();
        } else if (o.t === 'klackalica') {
          ctx.beginPath();
          ctx.moveTo(cx - 16, b); ctx.lineTo(cx, b - o.h * 0.5); ctx.lineTo(cx + 16, b);
          ctx.closePath(); fs('#D97757');
          var tilt = -0.40 + 0.80 * (a < 1 ? a * a * (3 - 2 * a) : 1);
          ctx.save();
          ctx.translate(cx, b - o.h * 0.5 - 2);
          ctx.rotate(tilt);
          rr(-o.w * 0.52, -7, o.w * 1.04, 14, 7); fs('#9FC58C');
          ctx.restore();
        } else {
          var comp = o.fired ? (a < 0.25 ? 1 - 1.6 * a : (a < 0.6 ? 0.6 + 1.1 * (a - 0.25) : 1)) : 1;
          var hh = (o.h - 22) * comp;
          ctx.strokeStyle = '#171412'; ctx.lineWidth = 5; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
          ctx.beginPath();
          for (var i = 0; i <= 7; i++) {
            var yy = b - 9 - hh * i / 7;
            var xx = cx + (i % 2 === 0 ? -o.w * 0.30 : o.w * 0.30);
            if (i === 0) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy);
          }
          ctx.stroke();
          rr(cx - o.w * 0.50, b - 11, o.w, 12, 6); fs('#D8C8F7');
          rr(cx - o.w * 0.54, b - 13 - hh - 8, o.w * 1.08, 15, 7); fs('#D8C8F7');
        }
      }

      function draw() {
        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = '#FFFCF2';
        ctx.fillRect(0, 0, W, H);

        /* samo jedna crta za pod */
        ctx.strokeStyle = '#171412'; ctx.lineWidth = 5; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(10, GND); ctx.lineTo(W - 10, GND); ctx.stroke();

        for (var i = 0; i < st.obs.length; i++) drawObs(st.obs[i]);

        var sq = st.land > 0 ? 0.13 * (st.land / 6) : 0;
        ball(PX, GND - R - st.y + (st.land > 0 ? R * sq : 0), R, sq, st.over);

        ctx.fillStyle = '#171412';
        ctx.font = '700 30px Inter, system-ui, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(st.score, W - 20, 44);
        ctx.textAlign = 'center';
        if (!st.run) {
          ctx.fillStyle = 'rgba(23,18,15,.55)';
          ctx.font = '700 24px Inter, system-ui, sans-serif';
          ctx.fillText(TOUCH ? 'tapni za start' : 'klikni za start', W / 2, 78);
        }
        if (st.over) {
          ctx.fillStyle = '#171412';
          ctx.font = '800 38px Inter, system-ui, sans-serif';
          ctx.fillText('BUM!', W / 2, 84);
        }
        ctx.textAlign = 'left';
      }

      function step() {
        st.t++;
        st.v -= G;
        st.y += st.v;
        if (st.y <= 0) { if (st.v < -5) st.land = 6; st.y = 0; st.v = 0; }
        if (st.land > 0) st.land--;
        st.sp = Math.min(MOB ? 7.4 : 9, (MOB ? 4.3 : 5) + st.score * (MOB ? 0.12 : 0.15));
        st.next--;
        if (st.next <= 0) {
          var key = SEQ[st.n % SEQ.length]; st.n++;
          var d = DEF[key];
          st.obs.push({ t: key, kind: d.kind, w: d.w, h: d.h, hit: d.hit || 0, pow: d.pow || 0, x: W + 30, done: false, fired: false, a: 0 });
          st.next = Math.round((MOB ? 96 : 112) + (st.t * 17 % 40) - Math.min(28, st.score * 1.0));
        }
        for (var i = st.obs.length - 1; i >= 0; i--) {
          var o = st.obs[i];
          o.x -= st.sp;
          if (o.fired) o.a++;
          if (!o.done && o.x + o.w < PX - R) { o.done = true; st.score++; }
          if (o.x + o.w < -80) { st.obs.splice(i, 1); continue; }
          var overlap = (PX + R * 0.6 > o.x) && (PX - R * 0.6 < o.x + o.w);
          if (o.kind === 'l') {
            if (!o.fired && overlap && st.y < 46) { st.v = o.pow; o.fired = true; o.a = 0; }
          } else {
            var bottom = GND - st.y;
            if (PX + R - 12 > o.x + 10 && PX - R + 12 < o.x + o.w - 10 && bottom - 6 > GND - o.hit + 8) st.over = true;
          }
        }
        draw();
        if (st.over) { setTimeout(function () { showForm(st.score); }, 1500); return; }
        raf = requestAnimationFrame(step);
      }
      function loop() { raf = requestAnimationFrame(step); }
      draw();
    }
    showGame();
    ov.addEventListener('click', function (e) { if (e.target === ov) close(K_CLOSED); });
  }

  function arm() {
    if (ls(K_CLOSED) || ls(K_DONE)) return;
    var fired = false;
    function go() { if (fired) return; fired = true; window.removeEventListener('scroll', onS); popup(); }
    function onS() {
      var h = document.documentElement.scrollHeight - window.innerHeight;
      if (h > 0 && window.scrollY / h > SCROLL_AT) go();
    }
    window.addEventListener('scroll', onS, { passive: true });
    setTimeout(go, DELAY);
    document.addEventListener('submit', function (e) {
      var t = e.target;
      if (t && t.querySelector && t.querySelector('input[type="email"]')) lsSet(K_DONE, '1');
    }, true);
  }

  window.kzOpenNewsletter = function () { popup(true); };
  function init() { footerForm(); arm(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
  window.addEventListener('load', footerForm);
})();
