import { createHash } from 'node:crypto';

export type FrameCandidate = { timestampMs: number; difference: number; sha256?: string; path?: string };
export type CoverageMode = 'economical' | 'detailed';

export function planFrameAnalysis(candidates: FrameCandidate[], durationMs: number, mode: CoverageMode): FrameCandidate[] {
  const ordered = [...candidates].filter((candidate) => Number.isInteger(candidate.timestampMs) && candidate.timestampMs >= 0 && candidate.timestampMs <= Math.max(0, durationMs)).sort((a, b) => a.timestampMs - b.timestampMs);
  if (mode === 'detailed') return dedupe(ordered);
  if (!ordered.length) return [];
  const selected = new Map<number, FrameCandidate>();
  const protectedTimestamps = new Set<number>();
  const interval = Math.max(1, durationMs / 12);
  for (let index = 0; index < 12; index += 1) {
    const start = index * interval;
    const end = index === 11 ? Number.POSITIVE_INFINITY : (index + 1) * interval;
    const available = ordered.filter((candidate) => candidate.timestampMs >= start && candidate.timestampMs < end);
    if (!available.length) continue;
    selected.set(available[0]!.timestampMs, available[0]!);
    const greatestDifference = [...available].sort((a, b) => b.difference - a.difference || a.timestampMs - b.timestampMs)[0]!;
    selected.set(greatestDifference.timestampMs, greatestDifference);
  }
  const first = ordered[0]!;
  const final = ordered.at(-1)!;
  selected.set(first.timestampMs, first);
  selected.set(final.timestampMs, final);
  protectedTimestamps.add(first.timestampMs);
  protectedTimestamps.add(final.timestampMs);
  const bounded = [...selected.values()];
  while (bounded.length > 24) {
    let removeAt = -1;
    for (let index = 0; index < bounded.length; index += 1) {
      const candidate = bounded[index]!;
      if (protectedTimestamps.has(candidate.timestampMs)) continue;
      const current = removeAt < 0 ? undefined : bounded[removeAt];
      if (!current || candidate.difference < current.difference || (candidate.difference === current.difference && candidate.timestampMs > current.timestampMs)) removeAt = index;
    }
    if (removeAt < 0) break;
    bounded.splice(removeAt, 1);
  }
  return dedupe(bounded).sort((a, b) => a.timestampMs - b.timestampMs).slice(0, 24);
}

function dedupe(candidates: FrameCandidate[]): FrameCandidate[] {
  return [...new Map(candidates.map((candidate) => [candidate.timestampMs, candidate])).values()];
}

export function framePlanHash(candidates: FrameCandidate[], mode: CoverageMode, durationMs: number): string {
  return createHash('sha256').update(JSON.stringify({ version: 1, mode, durationMs, candidates })).digest('hex');
}

export function candidateTimestamps(durationMs: number): number[] {
  const boundedDuration = Math.max(0, Math.min(durationMs, 20 * 60_000));
  const result: number[] = [];
  for (let timestampMs = 0; timestampMs <= boundedDuration; timestampMs += 500) result.push(timestampMs);
  return result;
}
