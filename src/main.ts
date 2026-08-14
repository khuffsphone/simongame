import { createWebAudioService } from './core/audio';
import { Engine } from './core/engine';
import { normalizeSeed } from './core/rng';
import { createDefaultRegistry } from './modalities';
import { createApp } from './ui/app';
import './styles.css';

const root = document.querySelector<HTMLDivElement>('#app');
if (!root) throw new Error('#app container missing from index.html');

// ?seed= pins a deterministic run for repro (CANON §5).
const pinnedSeed = normalizeSeed(new URLSearchParams(window.location.search).get('seed'));

const registry = createDefaultRegistry();
const audio = createWebAudioService();

// The stage is created here because the engine needs it before the app shell
// that displays it exists.
const stage = document.createElement('main');
stage.className = 'stage';
stage.dataset['testid'] = 'stage';

const engine = new Engine({
  registry,
  stage,
  audio,
  visibility: document,
  pinnedSeed,
  reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
});

createApp({ root, stage, engine, audio, registry });
engine.mount();
