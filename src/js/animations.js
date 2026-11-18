/**
 * Scroll reveals, hero text animation, role rotator and timeline progress.
 * Everything degrades to fully visible content when motion is reduced.
 */
export function initAnimations({ reducedMotion = false } = {}) {
  splitTagline();
  initReveals(reducedMotion);
  initRoleRotator(reducedMotion);
  initTimelineProgress(reducedMotion);
}

/* Split the hero tagline into masked words that slide up one by one. */
function splitTagline() {
  const el = document.querySelector('[data-split]');
  if (!el) return;
  const accentWords = new Set(['Intelligence.', 'Future.']);
  const words = el.textContent.trim().split(/\s+/);
  el.textContent = '';
  words.forEach((word, i) => {
    const outer = document.createElement('span');
    outer.className = 'word' + (accentWords.has(word) ? ' is-accent' : '');
    outer.setAttribute('aria-hidden', 'true');
    const inner = document.createElement('span');
    inner.textContent = word;
    inner.style.setProperty('--i', i);
    outer.append(inner);
    el.append(outer);
    // Break after the first sentence for a two-line rhythm
    if (word.endsWith('.') && i < words.length - 1) el.append(document.createElement('br'));
    else if (i < words.length - 1) el.append(' ');
  });
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('is-in')));
}

function initReveals(reducedMotion) {
  const items = [...document.querySelectorAll('[data-reveal]')];

  const finish = (el) => {
    el.classList.add('is-visible');
    // Once revealed, hand the element's transform back to hover effects (tilt)
    const cleanup = () => el.removeAttribute('data-reveal');
    if (reducedMotion) cleanup();
    else el.addEventListener('transitionend', cleanup, { once: true });
  };

  if (reducedMotion || !('IntersectionObserver' in window)) {
    items.forEach(finish);
    return;
  }

  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        finish(entry.target);
        io.unobserve(entry.target);
      });
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.12 },
  );
  items.forEach((el) => io.observe(el));
}

/* Types out each target role, then deletes it, in a loop. */
function initRoleRotator(reducedMotion) {
  const el = document.querySelector('.role-rotator');
  if (!el) return;
  let roles;
  try {
    roles = JSON.parse(el.dataset.roles);
  } catch {
    return;
  }
  if (reducedMotion) {
    el.textContent = `"${roles[1]}"`;
    return;
  }

  let roleIndex = 1;
  let charIndex = roles[roleIndex].length;
  let deleting = true;
  let timer = 0;

  const loop = () => {
    const role = roles[roleIndex];
    charIndex += deleting ? -1 : 1;
    el.textContent = `"${role.slice(0, charIndex)}"`;

    let delay = deleting ? 35 : 70;
    if (!deleting && charIndex === role.length) {
      deleting = true;
      delay = 2200;
    } else if (deleting && charIndex === 0) {
      deleting = false;
      roleIndex = (roleIndex + 1) % roles.length;
      delay = 300;
    }
    timer = window.setTimeout(loop, delay);
  };

  timer = window.setTimeout(loop, 2600);
  document.addEventListener('visibilitychange', () => {
    window.clearTimeout(timer);
    if (!document.hidden) timer = window.setTimeout(loop, 600);
  });
}

/* Fills the timeline track as the user scrolls through the experience section. */
function initTimelineProgress(reducedMotion) {
  const timeline = document.getElementById('timeline');
  const progress = timeline?.querySelector('.timeline-progress');
  if (!progress) return;
  if (reducedMotion) {
    progress.style.setProperty('--progress', 1);
    return;
  }

  let ticking = false;
  const update = () => {
    ticking = false;
    const rect = timeline.getBoundingClientRect();
    const start = window.innerHeight * 0.75;
    const ratio = (start - rect.top) / rect.height;
    progress.style.setProperty('--progress', Math.min(Math.max(ratio, 0), 1).toFixed(3));
  };
  const onScroll = () => {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(update);
    }
  };
  update();
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
}
