import { describe, expect, it } from 'vitest';
import { planFrameAnalysis } from '../packages/core/src/index';

describe('frame coverage planning', () => {
  const candidates = Array.from({ length: 120 }, (_, index) => ({ timestampMs: index * 500, difference: index % 17 }));
  it('keeps every valid candidate in detailed mode', () => {
    expect(planFrameAnalysis(candidates, 59_500, 'detailed')).toHaveLength(120);
  });
  it('bounds economical mode while retaining both endpoints', () => {
    const selected = planFrameAnalysis(candidates, 59_500, 'economical');
    expect(selected).toHaveLength(24);
    expect(selected[0]?.timestampMs).toBe(0);
    expect(selected.at(-1)?.timestampMs).toBe(59_500);
  });
});
