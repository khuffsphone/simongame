import type { AudioService } from '../core/audio';
import type { Engine, EngineState } from '../core/engine';
import type { ModalityRegistry } from '../core/registry';
import './app.css';

/**
 * The app shell: HUD, stage, and the overlay that owns the start gesture.
 *
 * The overlay's start button is the only place audio is unlocked — the engine
 * refuses to run until the context reports 'running' (CANON §9).
 */

export interface AppOptions {
  root: HTMLElement;
  /** Created by the caller, because the engine needs it before the app exists. */
  stage: HTMLElement;
  engine: Engine;
  audio: AudioService;
  registry: ModalityRegistry;
}

const OVERLAY_COPY: Record<string, { title: string; body: string; action: string | null }> = {
  start: {
    title: 'MODESHIFT',
    body: 'Watch the sequence, then repeat it. The mode changes as you climb.',
    action: 'Tap to start',
  },
  paused: {
    title: 'Paused',
    body: 'You left mid-run. Come back and the level replays from the top — once.',
    action: null,
  },
  fail: {
    title: 'Run over',
    body: '',
    action: 'Play again',
  },
  blocked: {
    title: 'Audio unavailable',
    body: 'MODESHIFT needs the Web Audio API. The run cannot start without it.',
    action: 'Try again',
  },
};

export function createApp({ root, stage, engine, audio, registry }: AppOptions): void {
  root.innerHTML = '';
  root.className = 'app';
  root.dataset['state'] = 'BOOT';

  // --- HUD ---------------------------------------------------------------
  const hud = document.createElement('header');
  hud.className = 'hud';

  const cell = (label: string, testId: string, initial: string): HTMLElement => {
    const wrapper = document.createElement('div');
    wrapper.className = 'hud__cell';
    const caption = document.createElement('span');
    caption.className = 'hud__label';
    caption.textContent = label;
    const value = document.createElement('b');
    value.className = 'hud__value';
    value.dataset['testid'] = testId;
    value.textContent = initial;
    wrapper.append(caption, value);
    return wrapper;
  };

  const levelCell = cell('Level', 'hud-level', '1');
  const modeCell = cell('Mode', 'hud-mode', '—');
  const stepCell = cell('Step', 'hud-step', '0 / 0');
  const replayCell = cell('Replays', 'hud-replays', '1');
  const retryCell = cell('Retries', 'hud-retries', '1');
  hud.append(levelCell, modeCell, stepCell, replayCell, retryCell);

  const read = (host: HTMLElement): HTMLElement => host.querySelector('.hud__value')!;
  const levelValue = read(levelCell);
  const modeValue = read(modeCell);
  const stepValue = read(stepCell);
  const replayValue = read(replayCell);
  const retryValue = read(retryCell);

  // --- overlay -----------------------------------------------------------
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.dataset['testid'] = 'overlay';
  overlay.dataset['open'] = 'true';

  const panel = document.createElement('div');
  panel.className = 'overlay__panel';

  const title = document.createElement('h1');
  title.className = 'overlay__title';
  title.dataset['testid'] = 'overlay-title';

  const body = document.createElement('p');
  body.className = 'overlay__body';
  body.dataset['testid'] = 'overlay-body';

  const action = document.createElement('button');
  action.type = 'button';
  action.className = 'overlay__action';
  action.dataset['testid'] = 'overlay-action';

  panel.append(title, body, action);
  overlay.append(panel);

  const seedLine = document.createElement('footer');
  seedLine.className = 'seed';
  seedLine.dataset['testid'] = 'seed';

  root.append(hud, stage, overlay, seedLine);

  // --- overlay control ---------------------------------------------------
  let mode: keyof typeof OVERLAY_COPY = 'start';

  const renderOverlay = (next: keyof typeof OVERLAY_COPY, bodyOverride?: string): void => {
    mode = next;
    const copy = OVERLAY_COPY[next]!;
    title.textContent = copy.title;
    body.textContent = bodyOverride ?? copy.body;
    body.hidden = (bodyOverride ?? copy.body) === '';
    if (copy.action === null) {
      action.hidden = true;
      action.textContent = '';
    } else {
      action.hidden = false;
      action.textContent = copy.action;
    }
    overlay.dataset['open'] = 'true';
    overlay.dataset['mode'] = next;
  };

  const hideOverlay = (): void => {
    overlay.dataset['open'] = 'false';
  };

  renderOverlay('start');

  // --- the start gesture -------------------------------------------------
  // The AudioContext is constructed here, inside the gesture, never before it.
  //
  // CANON §8's pointerdown rule governs discrete *game* input on the pads. The
  // start button is UI chrome, and binding it to pointerdown alone made it a
  // silent no-op for keyboard, assistive tech, and any host that activates a
  // button with a synthetic click. Both are bound: pointerdown so touch unlocks
  // audio at the earliest possible gesture, click so every other path works.
  let starting = false;

  const beginRun = (): void => {
    // The overlay being open is the authority on whether a start is wanted, so
    // the click that trails a pointerdown cannot restart a live run.
    if (starting || overlay.dataset['open'] !== 'true') return;
    if (mode !== 'start' && mode !== 'fail' && mode !== 'blocked') return;
    starting = true;
    void (async () => {
      try {
        const state = await audio.unlock();
        if (state !== 'running') {
          renderOverlay(
            'blocked',
            `MODESHIFT needs the Web Audio API. The audio context reported "${state}".`,
          );
          return;
        }
        hideOverlay();
        engine.start();
      } catch (error) {
        renderOverlay('blocked', error instanceof Error ? error.message : String(error));
      } finally {
        starting = false;
      }
    })();
  };

  // No preventDefault here: cancelling pointerdown suppresses the button's
  // native focus and click behaviour, which is what broke the other paths.
  // Zoom and text selection are already handled by `touch-action: none`.
  action.addEventListener('pointerdown', beginRun);
  action.addEventListener('click', beginRun);

  // --- engine wiring -----------------------------------------------------
  const labelFor = (id: string): string => registry.get(id)?.label ?? id;

  engine.events.on('state', ({ state }: { state: EngineState }) => {
    root.dataset['state'] = state;
    // touch-action is suppressed only while a run is live (CANON §8).
    root.dataset['running'] = state === 'BOOT' || state === 'FAIL' ? 'false' : 'true';
    if (state === 'PAUSED') renderOverlay('paused');
    if (state === 'PRESENTING' && overlay.dataset['open'] === 'true' && mode === 'paused') {
      hideOverlay();
    }
  });

  engine.events.on('level', ({ level, steps, seed, plan, scheduled, substituted }) => {
    levelValue.textContent = String(level);
    stepValue.textContent = `0 / ${steps}`;
    // The HUD names the modality actually in play, not the one the schedule
    // nominally asked for (decisions/0004).
    const unique = [...new Set(plan)];
    modeValue.textContent =
      unique.length === 1 ? labelFor(unique[0]!) : `Mixed (${unique.length})`;
    modeValue.dataset['substituted'] = String(substituted);
    if (substituted && scheduled) modeValue.title = `${scheduled} not yet available`;
    seedLine.textContent = `seed ${seed}`;
  });

  engine.events.on('present', ({ index, total, modalityId }) => {
    stepValue.textContent = `${index + 1} / ${total}`;
    modeValue.textContent = labelFor(modalityId);
  });

  engine.events.on('capture', ({ index, total, modalityId }) => {
    stepValue.textContent = `${index + 1} / ${total}`;
    modeValue.textContent = labelFor(modalityId);
  });

  engine.events.on('quota', ({ replays, retries }) => {
    replayValue.textContent = String(replays);
    retryValue.textContent = String(retries);
  });

  engine.events.on('fail', ({ reason, level }) => {
    const why =
      reason === 'timeout'
        ? 'Ran out of time.'
        : reason === 'focus-lost'
          ? 'You left the game twice.'
          : 'Wrong step.';
    renderOverlay('fail', `${why} You reached level ${level}.`);
  });
}
