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
      '.kz-nl-doodle{position:absolute;pointer-events:none}',
      '@media(max-width:520px){.kz-nl-card{padding:24px 20px 20px;border-radius:24px}.kz-nl-h{font-size:22px}}',
      '.kz-fnl{max-width:1120px;margin:0 auto 34px;padding:22px 24px;border:2.5px dashed rgba(255,255,255,.35);border-radius:22px 26px 20px 24px;display:flex;flex-wrap:wrap;gap:16px;align-items:center;justify-content:space-between}',
      '.kz-fnl-t{font-family:"Baloo 2",Inter,sans-serif;font-weight:800;font-size:19px;color:#fff;margin:0 0 4px}',
      '.kz-fnl-s{margin:0;font:400 13.5px/1.5 Inter;color:rgba(255,255,255,.6)}',
      '.kz-fnl form{display:flex;gap:8px;flex-wrap:wrap}',
      '.kz-fnl input{box-sizing:border-box;padding:11px 14px;border:none;border-radius:10px;font:400 14px Inter;outline:none;min-width:190px}',
      '.kz-fnl button{padding:11px 20px;background:#FFD048;color:#171412;border:none;border-radius:10px;font:700 14px Inter;cursor:pointer;transition:transform .2s ease}',
      '.kz-fnl button:hover{transform:translateY(-2px)}',
      '.kz-fnl-ok{font:600 14px Inter;color:#FFD048}'
    ].join('\n');
    document.head.appendChild(s);
  }

  /* ---------- footer form ---------- */
  function footerForm() {
    var f = document.querySelector('footer');
    if (!f || f.querySelector('.kz-fnl')) return;
    if (f.querySelector('input[type="email"]')) return;
    if (document.querySelector('section input[type="email"]')) return;
    styles();
    var box = document.createElement('div');
    box.className = 'kz-fnl';
    box.innerHTML =
      '<div><p class="kz-fnl-t">Kužiš newsletter</p>' +
      '<p class="kz-fnl-s">Jednom mjesečno: konkretni trikovi za Canvu, Excel i web. Bez spama.</p></div>' +
      '<form novalidate><input type="email" required placeholder="vasa@email.com" aria-label="Email adresa">' +
      '<button type="submit">Prijavi me</button></form>';
    var grid = f.querySelector('.footer-grid');
    if (grid && grid.parentNode) grid.parentNode.insertBefore(box, grid.nextSibling);
    else f.insertBefore(box, f.firstChild);
    var form = box.querySelector('form');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var v = form.querySelector('input').value.trim();
      if (!v || v.indexOf('@') < 0) return;
      subscribe(v);
      form.outerHTML = '<div class="kz-fnl-ok">Hvala! Provjerite inbox za potvrdu prijave.</div>';
    });
  }

  /* ---------- pop-up quiz ---------- */
  var QS = [
    {
      q: 'Što ti trenutno jede najviše vremena?',
      a: [
        ['Dizajn objava i materijala', 'canva'],
        ['Tablice, papirologija, izvještaji', 'excel'],
        ['Web, vidljivost, "gdje sam na Googleu"', 'web']
      ]
    },
    {
      q: 'Kad zapneš, ti...',
      a: [
        ['Guglaš pola sata i nađeš pola rješenja', 'a'],
        ['Pitaš nekog tko to već zna', 'b'],
        ['Odgodiš za sutra (pa opet za sutra)', 'c']
      ]
    }
  ];
  var RESULTS = {
    canva: ['Ti si Vizualac.', 'Sve ti je u glavi, samo treba brže izaći van. Canva trikovi ti štede najviše vremena.'],
    excel: ['Ti si Sistematičar.', 'Voliš kad stvari štimaju. Par Excel formula i predložaka i pola posla radi se samo.'],
    web: ['Ti si Graditelj.', 'Želiš da te ljudi nađu i zapamte. Web i SEO savjeti su tvoj teren.']
  };

  function popup() {
    if (ls(K_CLOSED) || ls(K_DONE)) return;
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

    var step = 0, profile = 'canva';

    function close(flag) {
      lsSet(flag || K_CLOSED, '1');
      ov.classList.remove('on');
      setTimeout(function () { if (ov.parentNode) ov.parentNode.removeChild(ov); }, 350);
    }

    function dots(n) {
      var h = '<div class="kz-nl-dots">';
      for (var i = 0; i < 3; i++) h += '<div class="kz-nl-dot' + (i <= n ? ' on' : '') + '"></div>';
      return h + '</div>';
    }

    function draw() {
      var h = '<button class="kz-nl-x" aria-label="Zatvori">&times;</button>';
      if (step < QS.length) {
        var Q = QS[step];
        h += dots(step) + '<div class="kz-nl-kicker">Kužiš kviz</div>';
        h += '<h3 class="kz-nl-h">' + Q.q + '</h3>';
        h += '<p class="kz-nl-p">Dva pitanja, deset sekundi.</p>';
        for (var i = 0; i < Q.a.length; i++) {
          h += '<button class="kz-nl-opt" data-v="' + Q.a[i][1] + '">' + Q.a[i][0] + '</button>';
        }
      } else if (step === QS.length) {
        var R = RESULTS[profile] || RESULTS.canva;
        h += dots(2) + '<div class="kz-nl-kicker">Tvoj rezultat</div>';
        h += '<h3 class="kz-nl-h">' + R[0] + '</h3>';
        h += '<p class="kz-nl-p">' + R[1] + ' Šaljemo takve stvari jednom mjesečno - upiši mail pa ti pošaljemo.</p>';
        h += '<form class="kz-nl-form" novalidate><input class="kz-nl-in" type="email" required placeholder="vasa@email.com" aria-label="Email adresa">' +
             '<button class="kz-nl-go" type="submit">Šalji</button></form>';
        h += '<p class="kz-nl-fine">Bez spama. Odjava jednim klikom.</p>';
      } else {
        h += '<div class="kz-nl-kicker">Gotovo</div>';
        h += '<h3 class="kz-nl-h">Hvala! Provjeri inbox.</h3>';
        h += '<p class="kz-nl-p">Poslali smo ti mail za potvrdu prijave - klikni i to je to.</p>';
      }
      card.innerHTML = h;

      card.querySelector('.kz-nl-x').addEventListener('click', function () { close(K_CLOSED); });
      var opts = card.querySelectorAll('.kz-nl-opt');
      for (var j = 0; j < opts.length; j++) {
        opts[j].addEventListener('click', function () {
          if (step === 0) profile = this.getAttribute('data-v');
          step++;
          draw();
        });
      }
      var form = card.querySelector('form');
      if (form) {
        form.addEventListener('submit', function (e) {
          e.preventDefault();
          var v = form.querySelector('input').value.trim();
          if (!v || v.indexOf('@') < 0) return;
          subscribe(v);
          step++;
          draw();
          setTimeout(function () { close(K_DONE); }, 2600);
        });
      }
    }
    draw();

    document.addEventListener('keydown', function esc(e) {
      if (e.key === 'Escape' && ov.parentNode) { close(K_CLOSED); document.removeEventListener('keydown', esc); }
    });
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

  function init() { footerForm(); arm(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
  window.addEventListener('load', footerForm);
})();
