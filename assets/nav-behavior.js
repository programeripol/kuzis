/* Kužiš — osiguraj da je zajednicki mobilni CSS ucitan na SVAKOJ stranici.
   blog.html je "bundler" export koji nakon ucitavanja prepise <head>, pa se
   staticki <link> na mobile-nav.css izgubi (script se vec izvrsio pa prezivi).
   Zato ga ubacujemo iz JS-a, i ponavljamo provjeru ako ga netko obrise.
   Bonus: nijedna nova stranica ga ne moze zaboraviti ukljuciti. */
(function () {
  function ensureCss() {
    if (document.querySelector('link[href*="mobile-nav.css"]')) return;
    var l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = '/assets/mobile-nav.css';
    (document.head || document.documentElement).appendChild(l);
  }
  ensureCss();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ensureCss);
  window.addEventListener('load', ensureCss);
  setTimeout(ensureCss, 800);
  setTimeout(ensureCss, 2500);
  setTimeout(ensureCss, 6000);
})();

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

    // Bulletproof reconcile: ako iz bilo kojeg razloga (template runtime
    // zamijeni checkbox node pa se 'change' izgubi, povratak preko back
    // gumba, prekinuta navigacija) ostane body.position:fixed dok meni NIJE
    // otvoren, stranica se na mobitelu UOPCE ne moze skrolati. Ovo to sanira.
    function syncLock() {
      var t = document.getElementById('kz-nav-toggle');
      var open = !!(t && t.checked);
      if (isLocked && !open) { unlockScroll(); return; }
      if (!isLocked && !open && document.body.style.position === 'fixed') {
        var body = document.body;
        body.style.position = '';
        body.style.top = '';
        body.style.left = '';
        body.style.right = '';
        body.style.width = '';
      }
    }
    setInterval(syncLock, 400);
    window.addEventListener('pagehide', syncLock);
    document.addEventListener('click', function () { setTimeout(syncLock, 80); }, true);
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
      '.kz-nl-card{position:relative;width:100%;max-width:520px;min-height:412px;background:#fff;border:3px solid #171412;border-radius:30px 26px 32px 24px;box-shadow:9px 9px 0 #FFD048;padding:28px 26px 24px;box-sizing:border-box;transform:scale(.86) rotate(-2.5deg);opacity:0;transition:transform .45s cubic-bezier(.34,1.56,.64,1),opacity .3s ease;font-family:Inter,system-ui,sans-serif}',
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
      '.kz-nl-form{display:flex;flex-direction:column;gap:10px;margin-top:6px}',
      '.kz-nl-in{width:100%;box-sizing:border-box;padding:15px 16px;border:2.5px solid #171412;border-radius:16px 20px 14px 18px;font:400 15.5px Inter;outline:none}',
      '.kz-nl-in:focus{box-shadow:3px 3px 0 #FFD048}',
      '.kz-nl-go{display:block;width:100%;padding:16px;background:#FFD048;color:#171412;border:2.5px solid #171412;border-radius:16px 20px 14px 18px;font:800 17px Inter;letter-spacing:.08em;cursor:pointer;transition:transform .16s ease,box-shadow .16s ease}',
      '.kz-nl-again2{display:block;width:100%;margin-top:10px;padding:14px;background:#fff;color:#171412;border:2.5px solid #171412;border-radius:16px 20px 14px 18px;font:700 15px Inter;cursor:pointer;transition:transform .16s ease,box-shadow .16s ease}',
      '.kz-nl-again2:hover{transform:translate(-2px,-2px);box-shadow:4px 4px 0 #FFD048}',
      '.kz-nl-go:hover{transform:translate(-2px,-2px);box-shadow:4px 4px 0 #171412}',
      '.kz-nl-fine{margin:10px 0 0;font:400 12px/1.5 Inter;color:rgba(23,18,15,.5)}',
      '.kz-nl-fine a{color:#171412;font-weight:600}',
      '.kz-nl-cv{display:block;width:100%;height:auto;border:2.5px solid #171412;border-radius:16px 20px 14px 18px;background:#FFFCF2;cursor:pointer;touch-action:manipulation}',
      '.kz-nl-jump{display:block;width:100%;margin-top:12px;padding:16px;background:#FFD048;color:#171412;border:2.5px solid #171412;border-radius:16px 20px 14px 18px;font:800 17px Inter;letter-spacing:.08em;cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent}',
      '.kz-nl-jump:active{transform:translate(2px,2px)}',
      '.kz-nl-doodle{position:absolute;pointer-events:none}',
      '@media(max-width:520px){.kz-nl-card{padding:24px 20px 20px;border-radius:24px;min-height:380px}.kz-nl-h{font-size:22px}}',
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
  /* Footer: ujednaci ga s Pocetnom i ubaci newsletter kao obicnu stavku u
     stupac "Pratite nas". Prije je ovdje bio veliki isprekidani box (.kz-fnl)
     preko cijele sirine - maknut na Dorin zahtjev ("a ne cijeli box").
     Klik otvara isti pop-up s igricom, i na mobu i na desktopu.
     Usput poravnava footere ostalih stranica s onim na Pocetnoj:
       - naslov stupca "Program" -> "Usluge"
       - zuti CTA gumb ide u stupac Kontakt (ne u prvi stupac)
       - LinkedIn se mice iz Kontakta (ostaje pod "Pratite nas")
     Radi na zivom DOM-u jer isti footer postoji u ~57 datoteka. */
  function footerForm() {
    var f = document.querySelector('footer');
    if (!f || f.getAttribute('data-kz-footer') === '1') return;
    var grid = f.querySelector('.footer-grid');
    if (!grid || grid.children.length < 2) return;

    var cols = [].slice.call(grid.children);
    function headEl(col) {
      var k = col.firstElementChild;
      while (k) {
        var t = (k.textContent || '').trim();
        if (t && t.length < 22 && k.tagName !== 'A' && k.tagName !== 'P' && !k.querySelector('a')) return k;
        k = k.nextElementSibling;
      }
      return null;
    }
    var colKontakt = null, colSocial = null;
    for (var i = 0; i < cols.length; i++) {
      var he = headEl(cols[i]);
      var t = he ? he.textContent.trim().toLowerCase() : '';
      if (/^kontakt/.test(t)) colKontakt = cols[i];
      else if (/^prati/.test(t)) colSocial = cols[i];
      else if (/^program/.test(t)) he.textContent = 'Usluge';
    }
    if (!colSocial) return;
    f.setAttribute('data-kz-footer', '1');

    if (colKontakt) {
      var links = colKontakt.querySelectorAll('a');
      for (var k2 = 0; k2 < links.length; k2++) {
        var lt = links[k2].textContent.trim();
        if (/^linkedin$/i.test(lt)) links[k2].style.display = 'none';
        if (/po[s\u0161]aljite upit/i.test(lt)) {
          links[k2].setAttribute('style', 'align-self:flex-start;display:inline-flex;align-items:center;justify-content:center;margin-top:4px;padding:11px 20px;background:#FFD048;color:#171412;border-radius:8px;font:600 13.5px Inter;text-decoration:none;transition:transform .25s ease');
        }
      }
      var dupBtn = cols[0].querySelector('a[href*="kontakt"]');
      if (dupBtn) dupBtn.style.display = 'none';
      var firstP = cols[0].querySelector('p');
      if (firstP) firstP.style.marginBottom = '0';
    }

    if (!colSocial.querySelector('.kz-fnl-nl')) {
      var sib = colSocial.querySelector('a');
      var link = sib ? sib.cloneNode(false) : document.createElement('a');
      link.className = ((link.className || '') + ' kz-fnl-nl').trim();
      link.setAttribute('href', '#');
      link.textContent = 'Prijavi se na newsletter';
      link.addEventListener('click', function (e) { e.preventDefault(); popup(true); });
      (sib && sib.parentNode ? sib.parentNode : colSocial).appendChild(link);
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
        '<div class="kz-nl-kicker">Bodovi: ' + score + '</div>' +
        '<h3 class="kz-nl-h">' + praise + '</h3>' +
        '<p class="kz-nl-p">Ovako preskačemo i sve ostalo što vam krade vrijeme. Jednom mjesečno šaljemo konkretne trikove za Canvu, Excel i web.</p>' +
        '<form class="kz-nl-form" novalidate><input class="kz-nl-in" type="email" required placeholder="vasa@email.com" aria-label="Email adresa">' +
        '<button class="kz-nl-go" type="submit">Prijavi se</button></form>' +
        '<button type="button" class="kz-nl-again2">Igraj još jednom</button>' +
        '<p class="kz-nl-fine">Odjava jednim klikom.</p>';
      xBtn();
      var again = card.querySelector('.kz-nl-again2');
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
        '<p class="kz-nl-p">' + (TOUCH ? 'Klikni za skok.' : 'Klik ili razmaknica za skok.') + ' Klackalica, feder i kosina ti pomažu da skočiš više, iskoristi ih.</p>' +
        '<canvas class="kz-nl-cv" width="' + W + '" height="' + H + '"></canvas>' +
        (TOUCH ? '<button type="button" class="kz-nl-jump">SKOK</button>' : '') +
        '<p class="kz-nl-fine"><a href="#" class="kz-nl-skip">Preskoči igru i prijavi se na novosti</a></p>';
      xBtn();
      card.querySelector('.kz-nl-skip').addEventListener('click', function (e) { e.preventDefault(); showForm(0); });

      var cv = card.querySelector('.kz-nl-cv');
      var ctx = cv.getContext('2d');
      var TAU = Math.PI * 2;
      var G = 0.62, JUMP = 12.4, CEIL = 190;

      /* kind: 'o' = prepreka (smrtonosna), 'l' = katapult (izbaci uvis) */
      var DEF = {
        tratincice: { kind: 'o', w: 62, cw: 46, h: 50, hit: 48 },
        ruza: { kind: 'o', w: 50, cw: 40, h: 45, hit: 62 },
        drvo: { kind: 'o', w: 56, cw: 40, h: 64, hit: 60 },
        kisa: { kind: 'o', w: 84, cw: 44, h: 128, hit: 112 },
        kosina: { kind: 'l', w: 72, h: 42, pow: 13.5 },
        klackalica: { kind: 'l', w: 92, h: 46, pow: 14.5 },
        feder: { kind: 'l', w: 46, h: 50, pow: 15.0 }
      };
      /* katapult uvijek dolazi PRIJE prepreke da ti pomogne */
      var PAT = [
        [['tratincice', 0]],
        [['feder', 0], ['kisa', 16]],
        [['ruza', 0]],
        [['kosina', 0], ['drvo', 20]],
        [['tratincice', 0]],
        [['klackalica', 0], ['ruza', 22]],
        [['drvo', 0]],
        [['feder', 0], ['kisa', 16]]
      ];

      var st = { y: 0, v: 0, run: false, over: false, score: 0, sp: 5, t: 0, gi: 0, ii: 0, rot: 0, obs: [], next: 110, land: 0 };

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
      /* spoji vise krugova/pravokutnika u JEDAN oblik bez unutarnjih crta */
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
      function ball(x, y, r, sq, dead, rot, rolling) {
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(1 + sq, 1 - sq);
        ctx.save();
        ctx.rotate(rot);
        ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); fs('#FFD048');
        if (!dead && rolling) {
          /* kotrlja se sa zatvorenim ocima */
          ctx.strokeStyle = '#171412'; ctx.lineWidth = 4; ctx.lineCap = 'round';
          for (var s2 = -1; s2 <= 1; s2 += 2) {
            ctx.beginPath();
            ctx.arc(s2 * r * 0.34, -r * 0.02, r * 0.20, Math.PI * 1.12, Math.PI * 1.88);
            ctx.stroke();
          }
        }
        ctx.restore();
        if (dead) {
          ctx.strokeStyle = '#171412'; ctx.lineWidth = 4.2; ctx.lineCap = 'round';
          for (var s3 = -1; s3 <= 1; s3 += 2) {
            var ex = s3 * r * 0.33, ey = -r * 0.04, q = r * 0.18;
            ctx.beginPath();
            ctx.moveTo(ex - q, ey - q); ctx.lineTo(ex + q, ey + q);
            ctx.moveTo(ex + q, ey - q); ctx.lineTo(ex - q, ey + q);
            ctx.stroke();
          }
        } else if (!rolling) {
          /* u zraku - oci otvorene i uspravne */
          eye(-r * 0.34, -r * 0.04, r * 0.235, r * 0.30);
          eye(r * 0.34, -r * 0.04, r * 0.235, r * 0.30);
        }
        ctx.restore();
      }
      function daisy(x, base, h, s) {
        ctx.strokeStyle = '#171412'; ctx.lineWidth = 4; ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x, base);
        ctx.quadraticCurveTo(x - 4 * s, base - h * 0.5, x, base - h * 0.68);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x, base - h * 0.44);
        ctx.quadraticCurveTo(x + 14 * s, base - h * 0.58, x + 16 * s, base - h * 0.34);
        ctx.quadraticCurveTo(x + 7 * s, base - h * 0.29, x, base - h * 0.44);
        ctx.closePath(); fs('#9FC58C');
        var cy = base - h * 0.80, R2 = 10 * s, parts = [];
        for (var i = 0; i < 6; i++) { var a = TAU * i / 6; parts.push([x + Math.cos(a) * R2, cy + Math.sin(a) * R2, 7.5 * s]); }
        shape(parts, '#FFFFFF');
        ctx.beginPath(); ctx.arc(x, cy, 6 * s, 0, TAU); fs('#FFD048');
      }
      function rose(cx, base, h) {
        var cy = base - h * 0.88;
        /* stabljika: zelena s crnim rubom */
        ctx.lineCap = 'round';
        ctx.strokeStyle = '#171412'; ctx.lineWidth = 9;
        ctx.beginPath(); ctx.moveTo(cx, base); ctx.lineTo(cx, cy + 10); ctx.stroke();
        ctx.strokeStyle = '#9FC58C'; ctx.lineWidth = 4.5;
        ctx.beginPath(); ctx.moveTo(cx, base); ctx.lineTo(cx, cy + 10); ctx.stroke();
        /* trnovi */
        ctx.fillStyle = '#171412';
        var th = [[0.30, -1], [0.52, 1]];
        for (var i = 0; i < th.length; i++) {
          var yy = base - h * th[i][0], d = th[i][1];
          ctx.beginPath();
          ctx.moveTo(cx + d * 3, yy + 3); ctx.lineTo(cx + d * 13, yy - 3); ctx.lineTo(cx + d * 3, yy - 6);
          ctx.closePath(); ctx.fill();
        }
        /* listovi */
        for (var s4 = -1; s4 <= 1; s4 += 2) {
          var ly = base - h * (s4 < 0 ? 0.22 : 0.36);
          ctx.beginPath();
          ctx.moveTo(cx, ly);
          ctx.quadraticCurveTo(cx + s4 * 12, ly - 12, cx + s4 * 19, ly - 1);
          ctx.quadraticCurveTo(cx + s4 * 10, ly + 5, cx, ly);
          ctx.closePath(); fs('#9FC58C');
        }
        /* glava: 5 latica u krug + spirala u sredini */
        var parts = [];
        for (var p = 0; p < 5; p++) {
          var a2 = -Math.PI / 2 + TAU * p / 5;
          parts.push([cx + Math.cos(a2) * 10, cy + Math.sin(a2) * 10, 12]);
        }
        shape(parts, '#E0504B');
        ctx.strokeStyle = 'rgba(23,20,18,.55)'; ctx.lineWidth = 2.6; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.arc(cx, cy, 5.5, 0.5, 5.0); ctx.stroke();
        ctx.beginPath(); ctx.arc(cx, cy, 11.5, 1.4, 5.7); ctx.stroke();
      }
      function drawObs(o) {
        var b = GND, cx = o.x + o.w / 2;
        var a = o.fired ? Math.min(1, o.a / 13) : 0;
        if (o.t === 'tratincice') {
          daisy(cx - 15, b, 40, 1.05);
          daisy(cx + 16, b, 31, 0.88);
        } else if (o.t === 'ruza') {
          rose(cx, b, o.h);
        } else if (o.t === 'drvo') {
          rr(cx - 9, b - 30, 18, 30, 6); fs('#D97757');
          shape([[cx - 15, b - 44, 19], [cx + 15, b - 46, 19], [cx, b - 58, 23]], '#9FC58C');
        } else if (o.t === 'kisa') {
          var cy2 = b - o.h + 26;
          shape([[cx - 24, cy2, 20], [cx + 24, cy2 - 2, 18], [cx, cy2 - 12, 24],
          [cx - 34, cy2 - 4, 68, 24, 12]], '#B9BCC4');
          var cb = cy2 + 20, span = b - cb;
          ctx.strokeStyle = '#8ECAE6'; ctx.lineWidth = 4; ctx.lineCap = 'round';
          for (var c2 = -1; c2 <= 1; c2++) {
            for (var dd = 0; dd < 3; dd++) {
              var yy2 = cb + ((st.t * 5 + dd * span / 3 + c2 * 17) % span);
              ctx.beginPath(); ctx.moveTo(cx + c2 * 20 + 3, yy2); ctx.lineTo(cx + c2 * 20, yy2 + 12); ctx.stroke();
            }
          }
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
          for (var i2 = 0; i2 <= 7; i2++) {
            var yy = b - 9 - hh * i2 / 7;
            var xx = cx + (i2 % 2 === 0 ? -o.w * 0.30 : o.w * 0.30);
            if (i2 === 0) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy);
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
        ball(PX, GND - R - st.y + (st.land > 0 ? R * sq : 0), R, sq, st.over, st.rot, st.run && st.y <= 1);

        ctx.fillStyle = '#171412';
        ctx.font = '700 30px Inter, system-ui, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(st.score, W - 20, 44);
        ctx.textAlign = 'center';
        if (!st.run) {
          ctx.fillStyle = 'rgba(23,18,15,.55)';
          ctx.font = '700 24px Inter, system-ui, sans-serif';
          ctx.fillText('klikni za start', W / 2, 78);
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
        if (st.y <= 0) { if (st.v < -4) st.land = 6; st.y = 0; st.v = 0; }
        if (st.land > 0) st.land--;
        st.sp = Math.min(MOB ? 8.6 : 11, (MOB ? 4.3 : 5) + st.score * (MOB ? 0.20 : 0.26));
        st.rot += (st.y <= 1 ? st.sp / R : st.sp / R * 0.35);
        st.next--;
        if (st.next <= 0) {
          var grp = PAT[st.gi % PAT.length];
          var it = grp[st.ii];
          var d = DEF[it[0]];
          st.obs.push({ t: it[0], kind: d.kind, w: d.w, cw: d.cw || d.w, h: d.h, hit: d.hit || 0, pow: d.pow || 0, x: W + 30, done: false, fired: false, a: 0 });
          st.ii++;
          if (st.ii < grp.length) { st.next = grp[st.ii][1]; }
          else { st.ii = 0; st.gi++; st.next = Math.round((MOB ? 100 : 118) + (st.t * 17 % 36) - Math.min(30, st.score * 0.9)); }
        }
        for (var i = st.obs.length - 1; i >= 0; i--) {
          var o = st.obs[i];
          o.x -= st.sp;
          if (o.fired) o.a++;
          if (!o.done && o.x + o.w < PX - R) { o.done = true; st.score++; }
          if (o.x + o.w < -90) { st.obs.splice(i, 1); continue; }
          if (o.kind === 'l') {
            if (!o.fired && PX + R * 0.6 > o.x && PX - R * 0.6 < o.x + o.w) {
              var maxV = Math.sqrt(Math.max(0, 2 * G * (CEIL - st.y)));
              st.v = Math.min(o.pow, maxV);
              o.fired = true; o.a = 0;
            }
          } else {
            var half = o.cw / 2, ocx = o.x + o.w / 2, bottom = GND - st.y;
            if (PX + R - 12 > ocx - half && PX - R + 12 < ocx + half && bottom - 6 > GND - o.hit + 8) st.over = true;
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
  /* Template runtime zna prerenderati footer nakon nasih poziva - guard je
     data-kz-footer atribut na <footer>, pa ponovni pozivi nisu skupi. */
  setTimeout(footerForm, 1200);
  setTimeout(footerForm, 3000);
  setTimeout(footerForm, 6000);
})();
