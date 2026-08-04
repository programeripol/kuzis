/* Kužiš — shared mobile header/nav behavior.
   Loaded on every page. Handles:
   - --kz-header-h CSS var (so the mobile menu panel starts exactly below
     the real header, on any page)
   - scroll lock while the mobile menu is open (position:fixed body trick —
     plain overflow:hidden on body is not reliable on iOS Safari)
   Edit ONLY this file to change menu open/close behavior site-wide. */
(function () {
  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  ready(function () {
    var header = document.querySelector('header');
    function setHeaderHeightVar() {
      if (header) {
        document.documentElement.style.setProperty('--kz-header-h', header.offsetHeight + 'px');
      }
    }
    setHeaderHeightVar();
    window.addEventListener('resize', setHeaderHeightVar);

    var toggle = document.getElementById('kz-nav-toggle');
    if (!toggle) return;

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

    toggle.addEventListener('change', function () {
      if (toggle.checked) lockScroll();
      else unlockScroll();
    });

    // If a nav link inside the open menu is clicked, the checkbox stays
    // checked while navigation happens — no need to unlock manually, the
    // new page load resets everything. But if the user hits back/forward
    // into a bfcache'd page with the menu still visually open, make sure
    // state is consistent on show.
    window.addEventListener('pageshow', function () {
      if (!toggle.checked) unlockScroll();
    });
  });
})();
