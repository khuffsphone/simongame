import { createWebAudioService } from './core/audio';
import { normalizeSeed } from './core/rng';
import { Fx } from './fx/fx';
import { createDefaultRegistry } from './modalities';
import { createApp } from './ui/app';
import './styles.css';

const root = document.querySelector<HTMLDivElement>('#app');
if (!root) throw new Error('#app container missing from index.html');

// ?seed= pins a deterministic run for repro (CANON §5).
const pinnedSeed = normalizeSeed(new URLSearchParams(window.location.search).get('seed'));
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

createApp({
  root,
  audio: createWebAudioService(),
  registry: createDefaultRegistry(),
  fx: new Fx({ reducedMotion }),
  pinnedSeed,
  reducedMotion,
});
