import { adaptivityAllowed, createAdaptiveProfile } from '../core/adaptive';
import type { AudioService } from '../core/audio';
import { Engine } from '../core/engine';
import { BUILT_IN_MODES, DIFFICULTIES, type Difficulty, type GameMode } from '../core/modes';
import { Persistence } from '../core/persistence';
import type { ModalityRegistry } from '../core/registry';
import { Fx } from '../fx/fx';
import { justAppearedGuard, onActivate, onPrime } from './activate';
import { createHaptics, type Haptics } from './haptics';
import { describeFailure } from './reveal';
import './app.css';

// Screen router: SPLASH -> MENU -> GAME. The engine owns gameplay; this owns
// presentation, FX, haptics, and the audio-unlock gesture.

export interface AppOptions {
  root: HTMLElement;
  audio: AudioService;
  registry: ModalityRegistry;
  fx: Fx;
  persistence?: Persistence;
  pinnedSeed?: number | null;
  reducedMotion?: boolean;
  /** Master switch for the per-modality time assist (CANON §4b). */
  adaptive?: boolean;
  /** Injected in tests; defaults to the real vibration API (CANON §8a). */
  haptics?: Haptics;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function createApp(options: AppOptions): { destroy: () => void } {
  const { root, audio, registry, fx } = options;
  const persistence = options.persistence ?? new Persistence();
  const reducedMotion = options.reducedMotion ?? false;
  const haptics = options.haptics ?? createHaptics({ reducedMotion });

  let engine: Engine | null = null;
  let mode: GameMode = 'classic';
  let difficulty: Difficulty = 'normal';

  root.className = 'app';
  root.dataset['screen'] = 'splash';

  const teardownGame = (): void => {
    // Only when a run is actually being torn down. This guard is load-bearing:
    // every render calls teardownGame() first, including the render that a
    // transition cue was just played for — so an unconditional cancel here
    // killed the "start" buzz a millisecond after it began, and the player felt
    // nothing on the one gesture that most needs to land.
    const hadRun = engine !== null;
    engine?.destroy();
    engine = null;
    fx.clear();
    // Vibration outlives the screen that started it unless something stops it.
    if (hadRun) haptics.cancel();
  };

  // --- splash -------------------------------------------------------------

  function renderSplash(): void {
    teardownGame();
    root.dataset['screen'] = 'splash';
    root.dataset['state'] = 'BOOT';
    root.replaceChildren();

    const screen = el('main', 'screen screen--splash');
    screen.setAttribute('aria-label', 'MODESHIFT splash');

    const marquee = el('div', 'marquee');
    marquee.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 12; i += 1) marquee.append(el('i', 'marquee__bulb'));

    const title = el('h1', 'logo');
    title.dataset['testid'] = 'splash-title';
    'MODESHIFT'.split('').forEach((ch, i) => {
      const span = el('span', 'logo__ch', ch);
      span.style.setProperty('--i', String(i));
      title.append(span);
    });

    const tagline = el('p', 'tagline', 'Colour · Number · Shape · Sound · Trace · Rhythm');
    const best = el(
      'p',
      'splash__best',
      persistence.bestLevel > 0 ? `Best level ${persistence.bestLevel}` : 'No runs yet',
    );

    const play = el('button', 'btn btn--hero', 'PLAY');
    play.type = 'button';
    play.dataset['testid'] = 'splash-play';

    screen.append(marquee, title, tagline, best, play);
    root.append(screen);

    let entering = false;
    onPrime(play, () => void audio.unlock());
    onActivate(play, () => {
      if (entering) return;
      entering = true;
      // The AudioContext is constructed here, inside the gesture, never before.
      void audio.unlock().then((state) => {
        if (state === 'running') audio.cue('splash');
        fx.mount();
        fx.burst(window.innerWidth / 2, window.innerHeight * 0.62, 26);
        haptics.play('tap');
        renderMenu();
      });
    });
  }

  // --- menu ---------------------------------------------------------------

  function renderMenu(): void {
    teardownGame();
    root.dataset['screen'] = 'menu';
    root.dataset['state'] = 'BOOT';
    root.replaceChildren();

    const screen = el('main', 'screen screen--menu');
    screen.setAttribute('aria-label', 'MODESHIFT menu');

    const header = el('header', 'menu__header');
    header.append(el('p', 'eyebrow', 'SELECT GAME'), el('h1', 'menu__title', 'MODESHIFT'));

    // Mode cards: the two built-ins, then one per registered modality.
    const modeList = el('div', 'cards');
    modeList.setAttribute('role', 'radiogroup');
    modeList.setAttribute('aria-label', 'Game type');

    const entries: { id: GameMode; label: string; blurb: string }[] = [
      ...BUILT_IN_MODES.map((m) => ({ id: m.id, label: m.label, blurb: m.blurb })),
      ...registry.all().map((m) => ({ id: m.id, label: `${m.label} only`, blurb: m.blurb })),
    ];

    const cards = new Map<GameMode, HTMLButtonElement>();
    for (const entry of entries) {
      const card = el('button', 'card');
      card.type = 'button';
      card.dataset['mode'] = String(entry.id);
      card.dataset['testid'] = `mode-${entry.id}`;
      card.setAttribute('role', 'radio');
      card.append(el('strong', 'card__label', entry.label), el('small', 'card__blurb', entry.blurb));
      const bestForMode = persistence.bestFor(String(entry.id));
      if (bestForMode > 0) card.append(el('em', 'card__best', `best ${bestForMode}`));
      cards.set(entry.id, card);
      modeList.append(card);
    }

    const diffGroup = el('div', 'segmented');
    diffGroup.setAttribute('role', 'radiogroup');
    diffGroup.setAttribute('aria-label', 'Difficulty');
    const diffButtons = new Map<Difficulty, HTMLButtonElement>();
    for (const level of DIFFICULTIES) {
      const button = el('button', 'segmented__item', level.toUpperCase());
      button.type = 'button';
      button.dataset['difficulty'] = level;
      button.dataset['testid'] = `difficulty-${level}`;
      button.setAttribute('role', 'radio');
      diffButtons.set(level, button);
      diffGroup.append(button);
    }

    const syncSelection = (): void => {
      for (const [id, card] of cards) {
        const on = id === mode;
        card.dataset['selected'] = String(on);
        card.setAttribute('aria-checked', String(on));
      }
      for (const [id, button] of diffButtons) {
        const on = id === difficulty;
        button.dataset['selected'] = String(on);
        button.setAttribute('aria-checked', String(on));
      }
    };

    for (const [id, card] of cards) {
      onActivate(card, () => {
        if (mode === id) return;
        mode = id;
        syncSelection();
        audio.cue('menuTick');
        haptics.play('select');
        const box = card.getBoundingClientRect();
        fx.mount();
        fx.spark(box.left + box.width / 2, box.top + box.height / 2, 6);
      });
    }
    for (const [id, button] of diffButtons) {
      onActivate(button, () => {
        if (difficulty === id) return;
        difficulty = id;
        syncSelection();
        audio.cue('menuTick');
        haptics.play('select');
      });
    }

    const start = el('button', 'btn btn--hero', 'PULL THE LEVER');
    start.type = 'button';
    start.dataset['testid'] = 'menu-start';

    const note = el(
      'p',
      'menu__note',
      'Classic teaches each mode, then integrates. Quick Mix is short. Marathon goes long.',
    );

    screen.append(
      header,
      el('p', 'eyebrow', 'GAME TYPE'),
      modeList,
      el('p', 'eyebrow', 'DIFFICULTY'),
      diffGroup,
      note,
      start,
    );
    root.append(screen);
    syncSelection();

    let starting = false;
    onPrime(start, () => void audio.unlock());
    onActivate(start, () => {
      if (starting) return;
      starting = true;
      void audio.unlock().then((state) => {
        if (state !== 'running') {
          starting = false;
          note.textContent = `Audio is required and reported "${state}". Tap again.`;
          return;
        }
        audio.cue('start');
        haptics.play('start');
        renderGame();
      });
    });
  }

  // --- game ---------------------------------------------------------------

  function renderGame(): void {
    teardownGame();
    root.dataset['screen'] = 'game';
    root.replaceChildren();

    const screen = el('main', 'screen screen--game');
    screen.setAttribute('aria-label', 'MODESHIFT game');

    const hud = el('header', 'hud');
    const makeCell = (label: string, testid: string, initial: string): HTMLElement => {
      const cell = el('div', 'hud__cell');
      cell.append(el('span', 'hud__label', label));
      const value = el('b', 'hud__value', initial);
      value.dataset['testid'] = testid;
      cell.append(value);
      return cell;
    };
    const levelCell = makeCell('Level', 'hud-level', '1');
    const modeCell = makeCell('Mode', 'hud-mode', '—');
    const stepCell = makeCell('Step', 'hud-step', '0 / 0');
    const comboCell = makeCell('Combo', 'hud-combo', '0');
    const replayCell = makeCell('Replays', 'hud-replays', '1');
    const retryCell = makeCell('Retries', 'hud-retries', '1');
    hud.append(levelCell, modeCell, stepCell, comboCell, replayCell, retryCell);

    const banner = el('p', 'banner', 'Watch the sequence');
    banner.dataset['testid'] = 'banner';

    const stage = el('div', 'stage');
    stage.dataset['testid'] = 'stage';

    const overlay = el('div', 'overlay');
    overlay.dataset['testid'] = 'overlay';
    overlay.dataset['open'] = 'false';
    const panel = el('div', 'overlay__panel');
    const oTitle = el('h2', 'overlay__title');
    oTitle.dataset['testid'] = 'overlay-title';
    const oBody = el('p', 'overlay__body');
    oBody.dataset['testid'] = 'overlay-body';
    const oPrimary = el('button', 'btn btn--hero', 'Play again');
    oPrimary.type = 'button';
    oPrimary.dataset['testid'] = 'overlay-action';
    const oSecondary = el('button', 'btn btn--ghost', 'Main menu');
    oSecondary.type = 'button';
    oSecondary.dataset['testid'] = 'overlay-menu';
    panel.append(oTitle, oBody, oPrimary, oSecondary);
    overlay.append(panel);

    const seedLine = el('footer', 'seed');
    seedLine.dataset['testid'] = 'seed';

    screen.append(hud, banner, stage, overlay, seedLine);
    root.append(screen);

    const value = (host: HTMLElement): HTMLElement => host.querySelector('.hud__value')!;
    const levelValue = value(levelCell);
    const modeValue = value(modeCell);
    const stepValue = value(stepCell);
    const comboValue = value(comboCell);
    const replayValue = value(replayCell);
    const retryValue = value(retryCell);

    // Built once per run, from the record as it stood at the start. Rebuilding
    // it mid-run would change the rules of a level while it was being played.
    const adaptive = createAdaptiveProfile(persistence.snapshot().modalityAccuracy, {
      enabled: (options.adaptive ?? true) && adaptivityAllowed(String(mode)),
    });

    const nextEngine = new Engine({
      registry,
      stage,
      audio,
      visibility: document,
      pinnedSeed: options.pinnedSeed ?? null,
      reducedMotion,
      mode,
      difficulty,
      adaptive,
    });
    engine = nextEngine;

    const labelFor = (id: string): string => registry.get(id)?.label ?? id;

    nextEngine.events.on('state', ({ state }) => {
      root.dataset['state'] = state;
      // Readability rule: every decorative effect is cleared before the
      // sequence plays, and the FX loop is stopped outright.
      if (state === 'PRESENTING' || state === 'LEVEL_SETUP') fx.clear();
      if (state === 'PRESENTING') banner.textContent = 'Watch';
      if (state === 'CAPTURING') banner.textContent = 'Your turn';
      if (state === 'PAUSED') {
        audio.cue('pause');
        haptics.cancel();
        openOverlay('Paused', 'You left mid-run. Come back and this level replays — once.', false);
      }
      if (state === 'LEVEL_SETUP' && overlay.dataset['open'] === 'true') closeOverlay();
    });

    nextEngine.events.on(
      'level',
      ({ level, steps, seed, plan, substituted, scheduled, assisted }) => {
        levelValue.textContent = String(level);
        stepValue.textContent = `0 / ${steps}`;
        const unique = [...new Set(plan)];
        modeValue.textContent =
          unique.length === 1 ? labelFor(unique[0]!) : `Mixed · ${unique.length}`;
        modeValue.dataset['substituted'] = String(substituted);
        if (substituted && scheduled) modeValue.title = `${scheduled} unavailable`;

        // The assist is disclosed, every level, in the same line as the seed.
        // A difficulty change the player cannot see is a difficulty change they
        // cannot trust.
        root.dataset['adaptive'] = String(assisted.length > 0);
        const assist =
          assisted.length > 0 ? ` · assist: ${assisted.map(labelFor).join(', ')}` : '';
        seedLine.textContent = `seed ${seed} · ${String(mode)} · ${difficulty}${assist}`;
      },
    );

    nextEngine.events.on('present', ({ index, total, modalityId }) => {
      stepValue.textContent = `${index + 1} / ${total}`;
      modeValue.textContent = labelFor(modalityId);
    });

    nextEngine.events.on('capture', ({ index, total, modalityId }) => {
      stepValue.textContent = `${index + 1} / ${total}`;
      modeValue.textContent = labelFor(modalityId);
    });

    nextEngine.events.on('score', ({ pass, accuracy, combo, modalityId }) => {
      comboValue.textContent = String(combo);
      persistence.recordScore(modalityId, pass, accuracy);
      if (!pass) return;
      audio.cue('correct', combo);
      haptics.play('step');
      // Correct step: a short burst only, never a screen-filling effect.
      const rect = stage.getBoundingClientRect();
      fx.mount();
      fx.spark(rect.left + rect.width / 2, rect.top + rect.height * 0.5, 6);
    });

    nextEngine.events.on('quota', ({ replays, retries }) => {
      replayValue.textContent = String(replays);
      retryValue.textContent = String(retries);
    });

    nextEngine.events.on('levelUp', ({ level }) => {
      const isBest = persistence.recordLevel(String(mode), level);
      audio.cue('levelUp', level);
      haptics.play(isBest ? 'bestRun' : 'levelUp');
      fx.mount();
      fx.jackpot(1 + level * 0.12);
      banner.textContent = isBest ? `NEW BEST · LEVEL ${level}` : `LEVEL ${level} CLEAR`;
      root.dataset['celebrate'] = 'true';
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => delete root.dataset['celebrate']);
      });
    });

    nextEngine.events.on('fail', (payload) => {
      audio.cue('fail');
      haptics.play('fail');
      fx.mount();
      fx.bust();
      const { title, body } = describeFailure(registry, payload);
      openOverlay(title, body, true);
    });

    // The overlay opens mid-tap on a wrong pad, so its buttons appear under a
    // finger that is already down. Ignore the trailing click.
    const overlayGuard = justAppearedGuard();

    function openOverlay(title: string, body: string, showActions: boolean): void {
      oTitle.textContent = title;
      oBody.textContent = body;
      oPrimary.hidden = !showActions;
      oSecondary.hidden = !showActions;
      overlay.dataset['open'] = 'true';
      overlayGuard.arm();
    }

    function closeOverlay(): void {
      overlay.dataset['open'] = 'false';
    }

    onActivate(oPrimary, () => {
      if (overlay.dataset['open'] !== 'true' || oPrimary.hidden) return;
      if (overlayGuard.blocked()) return;
      closeOverlay();
      audio.cue('start');
      renderGame();
    });
    onActivate(oSecondary, () => {
      if (overlay.dataset['open'] !== 'true' || oSecondary.hidden) return;
      if (overlayGuard.blocked()) return;
      audio.cue('menuSelect');
      renderMenu();
    });

    nextEngine.mount();
    nextEngine.start();
  }

  renderSplash();

  return {
    destroy: () => {
      teardownGame();
      fx.destroy();
      root.replaceChildren();
    },
  };
}
