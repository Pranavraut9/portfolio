/**
 * Sticky header state, active-section tracking and the mobile menu.
 */
export function initNavigation() {
  const header = document.getElementById('site-header');
  const toggle = document.getElementById('nav-toggle');
  const menu = document.getElementById('nav-menu');
  const links = [...document.querySelectorAll('[data-nav]')];
  const mobileQuery = window.matchMedia('(max-width: 960px)');

  /* --- header background on scroll --- */
  const onScroll = () => {
    const scrolled = window.scrollY > 24;
    header.classList.toggle('is-scrolled', scrolled);
    document.documentElement.classList.toggle('is-scrolled', scrolled);
  };
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  /* --- active link via IntersectionObserver --- */
  const linkById = new Map(links.map((l) => [l.dataset.nav, l]));
  // Sections without their own nav item map to the closest one
  const alias = { services: 'about', education: 'skills' };
  const sections = [...document.querySelectorAll('main > section[id]')];

  const setActive = (id) => {
    const key = alias[id] || id;
    links.forEach((l) => {
      const active = l.dataset.nav === key;
      l.classList.toggle('is-active', active);
      if (active) l.setAttribute('aria-current', 'true');
      else l.removeAttribute('aria-current');
    });
  };

  const visible = new Map();
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => visible.set(e.target.id, e.isIntersecting ? e.intersectionRatio : 0));
      // At the very bottom, the last section wins
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) {
        setActive(sections[sections.length - 1].id);
        return;
      }
      let best = null;
      let bestRatio = 0;
      visible.forEach((ratio, id) => {
        if (ratio > bestRatio) {
          best = id;
          bestRatio = ratio;
        }
      });
      if (best && linkById.has(alias[best] || best)) setActive(best);
    },
    { rootMargin: '-40% 0px -45% 0px', threshold: [0, 0.01, 0.25, 0.5, 0.75, 1] },
  );
  sections.forEach((s) => io.observe(s));

  /* --- mobile menu --- */
  const focusables = () => [toggle, ...menu.querySelectorAll('a[href], button')];

  function openMenu() {
    menu.classList.add('is-open');
    toggle.setAttribute('aria-expanded', 'true');
    toggle.setAttribute('aria-label', 'Close menu');
    document.body.classList.add('menu-open');
    header.classList.add('menu-is-open');
    menu.querySelector('a')?.focus({ preventScroll: true });
  }

  function closeMenu({ restoreFocus = false } = {}) {
    if (!menu.classList.contains('is-open')) return;
    menu.classList.remove('is-open');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Open menu');
    document.body.classList.remove('menu-open');
    header.classList.remove('menu-is-open');
    if (restoreFocus) toggle.focus();
  }

  toggle.addEventListener('click', () => {
    if (menu.classList.contains('is-open')) closeMenu();
    else openMenu();
  });

  menu.addEventListener('click', (e) => {
    if (e.target.closest('a')) closeMenu();
  });

  document.addEventListener('keydown', (e) => {
    if (!menu.classList.contains('is-open')) return;
    if (e.key === 'Escape') {
      closeMenu({ restoreFocus: true });
      return;
    }
    // Keep keyboard focus inside the open menu
    if (e.key === 'Tab') {
      const items = focusables();
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  });

  // Menu content is hidden from AT when closed on mobile; always available on desktop
  const syncMenuA11y = () => {
    if (!mobileQuery.matches) closeMenu();
  };
  mobileQuery.addEventListener?.('change', syncMenuA11y);
}
