import { describe, expect, it } from 'vitest';
import { followStep, JUMP_DISTANCE, lineTarget, renderWindow } from './continuous';

describe('continuous mode helpers', () => {
  it('renders the pages around the reading page and keeps a few more', () => {
    expect(renderWindow(1, 10)).toEqual({ render: [1, 2, 3], keep: [1, 2, 3, 4, 5] });
    expect(renderWindow(5, 10)).toEqual({ render: [4, 5, 6, 7], keep: [2, 3, 4, 5, 6, 7, 8, 9] });
    expect(renderWindow(10, 10).render).toEqual([9, 10]);
    expect(renderWindow(1, 1)).toEqual({ render: [1], keep: [1] });
  });

  it('puts a height at the reading line', () => {
    expect(lineTarget(1000, 0.33, 900)).toBeCloseTo(703);
    expect(lineTarget(100, 0.5, 800)).toBe(-300);
  });

  it('converges to a fixed target without overshoot', () => {
    let s = { pos: 0, vel: 0 };
    let max = 0;
    for (let i = 0; i < 120; i++) {
      s = followStep(s, 300, 1 / 60, 1000);
      max = Math.max(max, s.pos);
    }
    expect(s.pos).toBeCloseTo(300, 0);
    expect(max).toBeLessThanOrEqual(300.0001);
  });

  it('is independent of the frame rate', () => {
    let a = { pos: 0, vel: 0 };
    let b = { pos: 0, vel: 0 };
    for (let i = 0; i < 60; i++) a = followStep(a, 200, 1 / 60, 1000);
    for (let i = 0; i < 20; i++) b = followStep(b, 200, 1 / 20, 1000);
    expect(a.pos).toBeCloseTo(b.pos, 5);
  });

  it('follows a moving target smoothly (monotonic, bounded lag)', () => {
    let s = { pos: 0, vel: 0 };
    let prev = 0;
    let monotonic = true;
    for (let i = 1; i <= 600; i++) {
      s = followStep(s, i * 0.5, 1 / 60, 1000); // 30 px/s
      if (s.pos < prev - 1e-9) monotonic = false;
      prev = s.pos;
    }
    expect(monotonic).toBe(true);
    expect(300 - s.pos).toBeLessThan(15); // lag ≈ 2v/ω = 12 px
  });

  it('jumps to a far target (repeat)', () => {
    expect(followStep({ pos: 5000, vel: 40 }, 100, 1 / 60, 1000)).toEqual({ pos: 100, vel: 0 });
    expect(followStep({ pos: 0, vel: 0 }, JUMP_DISTANCE * 1000 - 1, 1 / 60, 1000).pos).toBeLessThan(10);
    expect(followStep({ pos: 500, vel: 10 }, 350, 1 / 60, 1000)).toEqual({ pos: 350, vel: 0 }); // repeat one system back
    expect(followStep({ pos: 500, vel: 10 }, 495, 1 / 60, 1000).pos).toBeGreaterThan(495); // tiny correction: glides
  });
});
