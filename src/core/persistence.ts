// Versioned localStorage with a corrupt-data fallback. Never throws: a private
// browsing window with storage disabled must not break the game.

const KEY = 'modeshift:v2';
const VERSION = 2;

export interface ModalityRecord {
  attempts: number;
  passes: number;
  accuracyTotal: number;
}

export interface SaveData {
  bestLevel: number;
  bestByMode: Record<string, number>;
  lastSeed: number | null;
  modalityAccuracy: Record<string, ModalityRecord>;
}

const EMPTY: SaveData = {
  bestLevel: 0,
  bestByMode: {},
  lastSeed: null,
  modalityAccuracy: {},
};

function blank(): SaveData {
  return { bestLevel: 0, bestByMode: {}, lastSeed: null, modalityAccuracy: {} };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function loadSave(storage: Storage | null): SaveData {
  if (!storage) return blank();
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return blank();
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || parsed['version'] !== VERSION) return blank();
    return {
      bestLevel: typeof parsed['bestLevel'] === 'number' ? parsed['bestLevel'] : 0,
      bestByMode: isRecord(parsed['bestByMode'])
        ? (parsed['bestByMode'] as Record<string, number>)
        : {},
      lastSeed: typeof parsed['lastSeed'] === 'number' ? parsed['lastSeed'] : null,
      modalityAccuracy: isRecord(parsed['modalityAccuracy'])
        ? (parsed['modalityAccuracy'] as Record<string, ModalityRecord>)
        : {},
    };
  } catch {
    // Corrupt JSON, quota errors, or a storage-disabled context all land here.
    return blank();
  }
}

export class Persistence {
  #data: SaveData;
  readonly #storage: Storage | null;

  constructor(storage: Storage | null = safeStorage()) {
    this.#storage = storage;
    this.#data = loadSave(storage);
  }

  snapshot(): SaveData {
    return {
      bestLevel: this.#data.bestLevel,
      bestByMode: { ...this.#data.bestByMode },
      lastSeed: this.#data.lastSeed,
      modalityAccuracy: Object.fromEntries(
        Object.entries(this.#data.modalityAccuracy).map(([k, v]) => [k, { ...v }]),
      ),
    };
  }

  get bestLevel(): number {
    return this.#data.bestLevel;
  }

  bestFor(mode: string): number {
    return this.#data.bestByMode[mode] ?? 0;
  }

  recordSeed(seed: number): void {
    this.#data.lastSeed = seed;
    this.#save();
  }

  /** Returns true when this run set a new personal best for the mode. */
  recordLevel(mode: string, level: number): boolean {
    let isBest = false;
    if (level > this.#data.bestLevel) {
      this.#data.bestLevel = level;
      isBest = true;
    }
    if (level > (this.#data.bestByMode[mode] ?? 0)) {
      this.#data.bestByMode[mode] = level;
      isBest = true;
    }
    if (isBest) this.#save();
    return isBest;
  }

  recordScore(modalityId: string, pass: boolean, accuracy: number): void {
    const record = this.#data.modalityAccuracy[modalityId] ?? {
      attempts: 0,
      passes: 0,
      accuracyTotal: 0,
    };
    record.attempts += 1;
    record.passes += pass ? 1 : 0;
    record.accuracyTotal += accuracy;
    this.#data.modalityAccuracy[modalityId] = record;
    this.#save();
  }

  reset(): void {
    this.#data = blank();
    this.#save();
  }

  #save(): void {
    if (!this.#storage) return;
    try {
      this.#storage.setItem(KEY, JSON.stringify({ version: VERSION, ...this.#data }));
    } catch {
      // Quota or disabled storage — the run continues without persistence.
    }
  }
}

function safeStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export const EMPTY_SAVE: Readonly<SaveData> = EMPTY;
