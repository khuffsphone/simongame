// Web Audio service — CANON §9, decisions/0003.
//
// No AudioContext is constructed until the first user gesture: `unlock()` is
// called from inside the tap handler and is the only place the constructor is
// reached. The engine refuses to enter PRESENTING unless state is 'running'.

export type AudioState = 'idle' | 'suspended' | 'running' | 'closed' | 'unavailable';

export interface ToneOptions {
  readonly freq: number;
  readonly durationMs: number;
  readonly type?: OscillatorType;
  readonly gain?: number;
}

export interface AudioService {
  readonly state: AudioState;
  unlock(): Promise<AudioState>;
  tone(options: ToneOptions): void;
  dispose(): void;
}

type AudioContextCtor = new () => AudioContext;

function resolveContextCtor(): AudioContextCtor | null {
  const scope = globalThis as unknown as {
    AudioContext?: AudioContextCtor;
    webkitAudioContext?: AudioContextCtor;
  };
  return scope.AudioContext ?? scope.webkitAudioContext ?? null;
}

const MASTER_GAIN = 0.25;
const ATTACK_S = 0.008;

export function createWebAudioService(): AudioService {
  let context: AudioContext | null = null;
  let master: GainNode | null = null;
  let state: AudioState = resolveContextCtor() ? 'idle' : 'unavailable';

  return {
    get state() {
      return state;
    },

    async unlock(): Promise<AudioState> {
      if (state === 'unavailable' || state === 'closed') return state;

      if (!context) {
        const Ctor = resolveContextCtor();
        if (!Ctor) {
          state = 'unavailable';
          return state;
        }
        context = new Ctor();
        master = context.createGain();
        master.gain.value = MASTER_GAIN;
        master.connect(context.destination);
      }

      if (context.state === 'suspended') {
        try {
          await context.resume();
        } catch {
          // A resume rejection means the gesture was not accepted; report the
          // real state rather than pretending.
        }
      }
      state = context.state === 'running' ? 'running' : 'suspended';
      return state;
    },

    tone({ freq, durationMs, type = 'sine', gain = 1 }: ToneOptions): void {
      if (!context || !master || state !== 'running') return;

      // One graph per note, disposed on `ended` — OscillatorNode is single-use.
      const osc = context.createOscillator();
      const envelope = context.createGain();
      const now = context.currentTime;
      const durationS = Math.max(0.02, durationMs / 1000);
      const peak = Math.max(0.0001, gain);

      osc.type = type;
      osc.frequency.setValueAtTime(freq, now);

      envelope.gain.setValueAtTime(0.0001, now);
      envelope.gain.linearRampToValueAtTime(peak, now + ATTACK_S);
      envelope.gain.exponentialRampToValueAtTime(0.0001, now + durationS);

      osc.connect(envelope);
      envelope.connect(master);

      osc.addEventListener(
        'ended',
        () => {
          osc.disconnect();
          envelope.disconnect();
        },
        { once: true },
      );

      osc.start(now);
      osc.stop(now + durationS);
    },

    dispose(): void {
      if (context) {
        void context.close();
        context = null;
        master = null;
      }
      state = resolveContextCtor() ? 'closed' : 'unavailable';
    },
  };
}

/**
 * A service that reports a fixed state and never makes a sound. Used by unit
 * and integration tests, where jsdom has no Web Audio at all.
 */
export function createSilentAudioService(initial: AudioState = 'running'): AudioService {
  let state = initial;
  return {
    get state() {
      return state;
    },
    async unlock() {
      if (state === 'idle' || state === 'suspended') state = 'running';
      return state;
    },
    tone() {},
    dispose() {
      state = 'closed';
    },
  };
}
