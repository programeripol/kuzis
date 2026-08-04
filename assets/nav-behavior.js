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
