/**
 * Pointer & UI interactions: card tilt/spotlight, skills orbit highlighting,
 * project detail dialog, copy-to-clipboard and resume availability check.
 */
export function initInteractions({ reducedMotion = false } = {}) {
  initTilt(reducedMotion);
  initSkillsOrbit();
  initProjectModal();
  initCopy();
  initResumeLinks();
  initProjectVisibility();

  const year = document.getElementById('year');
  if (year) year.textContent = String(new Date().getFullYear());
}

/* --- toast --- */
let toastTimer = 0;
function toast(message) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = message;
  el.classList.add('is-visible');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.classList.remove('is-visible'), 3600);
}

/* --- subtle 3D tilt + spotlight following the pointer (fine pointers only) --- */
function initTilt(reducedMotion) {
  const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  if (!fine) return;
  const maxTilt = reducedMotion ? 0 : 5;

  document.querySelectorAll('.tilt').forEach((card) => {
    let raf = 0;
    card.addEventListener('pointermove', (e) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = card.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width;
        const py = (e.clientY - r.top) / r.height;
        card.style.setProperty('--mx', `${px * 100}%`);
        card.style.setProperty('--my', `${py * 100}%`);
        card.style.setProperty('--ry', `${(px - 0.5) * maxTilt}deg`);
        card.style.setProperty('--rx', `${(0.5 - py) * maxTilt}deg`);
        card.classList.add('is-tilting');
      });
    });
    card.addEventListener('pointerleave', () => {
      cancelAnimationFrame(raf);
      card.classList.remove('is-tilting');
      card.style.setProperty('--rx', '0deg');
      card.style.setProperty('--ry', '0deg');
    });
  });
}

/* --- skills: hovering/focusing a category highlights its chips in the orbit --- */
function initSkillsOrbit() {
  const orbit = document.getElementById('orbit');
  const groups = document.querySelectorAll('.skill-group[data-cat]');
  if (!orbit || !groups.length) return;

  const activate = (group) => {
    groups.forEach((g) => g.classList.toggle('is-active', g === group));
    if (group) orbit.dataset.active = group.dataset.cat;
    else delete orbit.dataset.active;
  };

  groups.forEach((group) => {
    group.addEventListener('pointerenter', (e) => {
      if (e.pointerType === 'mouse') activate(group);
    });
    group.addEventListener('pointerleave', (e) => {
      if (e.pointerType === 'mouse') activate(null);
    });
    group.addEventListener('focus', () => activate(group));
    group.addEventListener('blur', () => activate(null));
  });
}

/* --- project details dialog --- */
function initProjectModal() {
  const modal = document.getElementById('project-modal');
  if (!modal || typeof modal.showModal !== 'function') {
    // Very old browsers: reveal the hidden details inline instead
    document.querySelectorAll('.project-more').forEach((m) => m.removeAttribute('hidden'));
    document.querySelectorAll('.project-btn').forEach((b) => b.remove());
    return;
  }

  const $ = (id) => document.getElementById(id);
  let opener = null;

  document.querySelectorAll('.project-btn').forEach((btn) => {
    btn.setAttribute('aria-haspopup', 'dialog');
    btn.addEventListener('click', () => {
      const card = btn.closest('.project');
      opener = btn;

      $('modal-kicker').textContent = card.querySelector('.project-kicker')?.textContent ?? '';
      $('modal-title').textContent = card.querySelector('.project-title')?.textContent ?? '';
      $('modal-desc').textContent = card.querySelector('.project-desc')?.textContent ?? '';
      $('modal-problem').replaceChildren(card.querySelector('.project-problem').cloneNode(true));
      $('modal-more').replaceChildren(...card.querySelector('.project-more').cloneNode(true).childNodes);
      $('modal-tags').replaceChildren(card.querySelector('.tags').cloneNode(true));

      const svg = card.querySelector('.project-visual svg')?.cloneNode(true);
      if (svg) {
        svg.removeAttribute('role');
        svg.removeAttribute('aria-label');
        svg.setAttribute('preserveAspectRatio', 'xMidYMid slice');
      }
      $('modal-visual').replaceChildren(...(svg ? [svg] : []));

      modal.showModal();
      modal.querySelector('.modal-inner').scrollTop = 0;
      document.body.style.overflow = 'hidden';
    });
  });

  const close = () => modal.close();
  modal.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
  // Click on the backdrop closes the dialog
  modal.addEventListener('click', (e) => {
    if (e.target === modal) close();
  });
  modal.addEventListener('close', () => {
    document.body.style.overflow = '';
    opener?.focus();
  });
}

/* --- copy email --- */
function initCopy() {
  document.querySelectorAll('[data-copy]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const text = btn.dataset.copy;
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        const ta = Object.assign(document.createElement('textarea'), { value: text });
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.append(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
      }
      const use = btn.querySelector('use');
      use?.setAttribute('href', '#i-check');
      toast('Email address copied to clipboard');
      window.setTimeout(() => use?.setAttribute('href', '#i-copy'), 2000);
    });
  });
}

/* --- resume: if /resume.pdf hasn't been added yet, explain instead of a broken download --- */
function initResumeLinks() {
  const links = document.querySelectorAll('[data-resume]');
  if (!links.length) return;
  let available = null;

  const check = async () => {
    if (available !== null) return available;
    try {
      const res = await fetch('/resume.pdf', { method: 'HEAD', cache: 'no-store' });
      const type = res.headers.get('content-type') || '';
      available = res.ok && type.includes('pdf');
    } catch {
      available = true; // offline / blocked: let the browser try normally
    }
    return available;
  };

  links.forEach((link) => {
    link.addEventListener('click', async (e) => {
      if (available === true) return;
      e.preventDefault();
      if (await check()) link.click();
      else toast('Resume is being updated — please email praut7818@gmail.com for a copy.');
    });
  });
}

/* --- run project illustration animations only while cards are on screen --- */
function initProjectVisibility() {
  const cards = document.querySelectorAll('.project');
  if (!('IntersectionObserver' in window)) {
    cards.forEach((c) => c.classList.add('is-in-view'));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => entries.forEach((e) => e.target.classList.toggle('is-in-view', e.isIntersecting)),
    { threshold: 0.15 },
  );
  cards.forEach((c) => io.observe(c));
}
