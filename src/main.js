import '@fontsource-variable/inter';
import '@fontsource-variable/space-grotesk';
import '@fontsource-variable/jetbrains-mono';
import './style.css';

import { initNavigation } from './js/navigation.js';
import { initAnimations } from './js/animations.js';
import { initInteractions } from './js/interactions.js';

const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

initNavigation();
initAnimations({ reducedMotion: reducedMotionQuery.matches });
initInteractions({ reducedMotion: reducedMotionQuery.matches });

/* Three.js is loaded as a separate chunk after first paint so it never blocks content. */
let sceneHandle = null;

async function startScene() {
  const canvas = document.getElementById('webgl');
  const anchor = document.getElementById('hero-visual');
  const { hasWebGL, initScene } = await import('./js/scene.js');

  if (!hasWebGL()) {
    document.documentElement.classList.add('no-webgl');
    return;
  }

  try {
    sceneHandle = initScene({ canvas, anchor, reducedMotion: reducedMotionQuery.matches });
  } catch (err) {
    console.warn('WebGL scene unavailable, using static fallback.', err);
    document.documentElement.classList.add('no-webgl');
  }
}

const idle = window.requestIdleCallback || ((cb) => setTimeout(cb, 1));
if (document.readyState === 'complete') idle(startScene);
else window.addEventListener('load', () => idle(startScene), { once: true });

// Re-init when the user toggles reduced motion at the OS level
reducedMotionQuery.addEventListener?.('change', () => {
  sceneHandle?.dispose();
  sceneHandle = null;
  startScene();
});

window.addEventListener('pagehide', (e) => {
  if (!e.persisted) sceneHandle?.dispose();
});

if (import.meta.hot) {
  import.meta.hot.dispose(() => sceneHandle?.dispose());
}
