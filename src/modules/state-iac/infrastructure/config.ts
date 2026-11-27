import * as env from '$app/env/private';

export type StateIacConfig = {
  /** Largest state object read, decompressed. */
  maxStateBytes: number;
  /** How long listings stay cached; states are also keyed by object version. */
  cacheTtlMs: number;
};

function int(raw: string | undefined, fallback: number, min: number, max: number): number {
  const value = Number.parseInt(raw?.trim().replace(/^["']|["']$/g, '') ?? '', 10);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

/** `STATE_IAC_MAX_STATE_MB` (default 50) and `STATE_IAC_CACHE_SECONDS` (default 60). */
export function readStateIacConfig(): StateIacConfig {
  return {
    maxStateBytes: int(env.STATE_IAC_MAX_STATE_MB, 50, 1, 500) * 1024 * 1024,
    cacheTtlMs: int(env.STATE_IAC_CACHE_SECONDS, 60, 0, 3600) * 1000,
  };
}
