// Web Audio service — CANON §9, decisions/0003.
//
// No AudioContext is constructed until the first user gesture: `unlock()` is
// called from inside the tap handler and is the only place the constructor is
// reached. The engine refuses to enter PRESENTING unless state is 'running'.
//
// Every voice is a single-use node graph disposed on `ended`. A master
// compressor sits in front of the destination so the jackpot stack stays loud
// without clipping.

export type AudioState = 'idle' | 'suspended' | 'running' | 'closed' | 'unavailable';

export type CueName =
  | 'splash'
  | 'menuTick'
  | 'menuSelect'
  | 'start'
  | 'correct'
  | 'levelUp'
  | 'fail'
  | 'pause'
  | 'resume';

export interface ToneOptions {
  readonly freq: number;
  readonly durationMs: number;
  readonly type?: OscillatorType;
  readonly gain?: number;
  readonly delayMs?: number;
}

export interface AudioService {
  readonly state: AudioState;
  unlock(): Promise<AudioState>;
  tone(options: ToneOptions): void;
  /** Named musical event. `intensity` scales celebration cues. */
  cue(name: CueName, intensity?: number): void;
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

const MASTER_GAIN = 0.42;
const ATTACK_S = 0.006;

/** Pentatonic climb, so the level-up arpeggio is always consonant. */
const CLIMB = [392.0, 493.88, 587.33, 783.99, 987.77, 1174.66];

export function createWebAudioService(): AudioService {
  let context: AudioContext | null = null;
  let master: GainNode | null = null;
  let state: AudioState = resolveContextCtor() ? 'idle' : 'unavailable';

  const ready = (): boolean => Boolean(context && master && state === 'running');

  function voice({ freq, durationMs, type = 'sine', gain = 1, delayMs = 0 }: ToneOptions): void {
    if (!ready() || !context || !master) return;
    const osc = context.createOscillator();
    const envelope = context.createGain();
    const start = context.currentTime + delayMs / 1000;
    const durationS = Math.max(0.02, durationMs / 1000);
    const peak = Math.max(0.0001, gain);

    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);

    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.linearRampToValueAtTime(peak, start + ATTACK_S);
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + durationS);

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
    osc.start(start);
    osc.stop(start + durationS);
  }

  /** Filtered noise burst — used for coin rattle, applause, and buzzer grit. */
  function noise(durationMs: number, gain: number, delayMs: number, filter: BiquadFilterType, hz: number): void {
    if (!ready() || !context || !master) return;
    const start = context.currentTime + delayMs / 1000;
    const frames = Math.max(1, Math.floor((context.sampleRate * durationMs) / 1000));
    const buffer = context.createBuffer(1, frames, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / frames);

    const source = context.createBufferSource();
    const biquad = context.createBiquadFilter();
    const envelope = context.createGain();
    source.buffer = buffer;
    biquad.type = filter;
    biquad.frequency.value = hz;
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.linearRampToValueAtTime(gain, start + 0.01);
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + durationMs / 1000);

    source.connect(biquad).connect(envelope).connect(master);
    source.addEventListener(
      'ended',
      () => {
        source.disconnect();
        biquad.disconnect();
        envelope.disconnect();
      },
      { once: true },
    );
    source.start(start);
    source.stop(start + durationMs / 1000 + 0.02);
  }

  function applause(delayMs: number, rounds: number): void {
    for (let i = 0; i < rounds; i += 1) {
      noise(70 + i * 9, 0.05, delayMs + i * 46, 'bandpass', 1400 + i * 90);
    }
  }

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
        // A compressor lets the jackpot stack be loud without clipping.
        const compressor = context.createDynamicsCompressor();
        compressor.threshold.setValueAtTime(-14, context.currentTime);
        compressor.ratio.setValueAtTime(9, context.currentTime);
        master.connect(compressor);
        compressor.connect(context.destination);
      }
      if (context.state === 'suspended') {
        try {
          await context.resume();
        } catch {
          // Gesture not accepted; report the real state rather than pretending.
        }
      }
      state = context.state === 'running' ? 'running' : 'suspended';
      return state;
    },

    tone: voice,

    cue(name: CueName, intensity = 1): void {
      if (!ready()) return;
      switch (name) {
        case 'splash':
          [261.63, 329.63, 392.0, 523.25].forEach((f, i) =>
            voice({ freq: f, durationMs: 200, type: 'triangle', gain: 0.5, delayMs: i * 90 }),
          );
          voice({ freq: 1046.5, durationMs: 420, type: 'sine', gain: 0.42, delayMs: 380 });
          noise(300, 0.09, 360, 'highpass', 2400);
          break;
        case 'menuTick':
          voice({ freq: 1320, durationMs: 45, type: 'square', gain: 0.16 });
          break;
        case 'menuSelect':
          voice({ freq: 880, durationMs: 60, type: 'square', gain: 0.24 });
          voice({ freq: 1320, durationMs: 90, type: 'sine', gain: 0.2, delayMs: 45 });
          break;
        case 'start':
          // Slot pull: a downward mechanical thunk, then the reel release.
          voice({ freq: 180, durationMs: 130, type: 'sawtooth', gain: 0.35 });
          voice({ freq: 90, durationMs: 200, type: 'square', gain: 0.28, delayMs: 60 });
          noise(220, 0.11, 120, 'bandpass', 900);
          voice({ freq: 660, durationMs: 160, type: 'triangle', gain: 0.3, delayMs: 220 });
          break;
        case 'correct': {
          // Pitch climbs with the combo so a streak sounds like a streak.
          const step = Math.min(CLIMB.length - 1, Math.max(0, Math.round(intensity)));
          voice({ freq: CLIMB[step]!, durationMs: 90, type: 'triangle', gain: 0.34 });
          voice({ freq: CLIMB[step]! * 2, durationMs: 70, type: 'sine', gain: 0.16, delayMs: 22 });
          break;
        }
        case 'levelUp': {
          const rounds = Math.min(6, 3 + Math.floor(intensity));
          for (let i = 0; i < rounds; i += 1) {
            voice({
              freq: CLIMB[Math.min(CLIMB.length - 1, i)]!,
              durationMs: 170,
              type: 'triangle',
              gain: 0.4,
              delayMs: i * 95,
            });
          }
          voice({ freq: 1567.98, durationMs: 520, type: 'sine', gain: 0.34, delayMs: rounds * 95 });
          noise(160, 0.12, rounds * 95, 'highpass', 3200);
          applause(rounds * 95 + 60, 8);
          break;
        }
        case 'fail':
          voice({ freq: 196, durationMs: 220, type: 'sawtooth', gain: 0.4 });
          voice({ freq: 130.81, durationMs: 320, type: 'sawtooth', gain: 0.34, delayMs: 130 });
          voice({ freq: 61.74, durationMs: 420, type: 'square', gain: 0.24, delayMs: 280 });
          noise(260, 0.08, 0, 'lowpass', 700);
          break;
        case 'pause':
          voice({ freq: 523.25, durationMs: 110, type: 'sine', gain: 0.26 });
          voice({ freq: 392.0, durationMs: 150, type: 'sine', gain: 0.22, delayMs: 90 });
          break;
        case 'resume':
          voice({ freq: 392.0, durationMs: 110, type: 'sine', gain: 0.24 });
          voice({ freq: 587.33, durationMs: 160, type: 'sine', gain: 0.26, delayMs: 85 });
          break;
      }
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

/** Silent stand-in for jsdom, which has no Web Audio at all. */
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
    cue() {},
    dispose() {
      state = 'closed';
    },
  };
}
