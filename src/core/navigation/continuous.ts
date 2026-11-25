// Pure helpers of the continuous mode (one vertical scroll): lazy page window, reading line, auto-scroll smoothing.

/** "Next" / "previous" in continuous mode scroll by this fraction of the screen (the rest overlaps). */
export const SCREEN_SCROLL = 0.85;

/** Beyond this distance (fraction of the screen) the auto-scroll jumps instead of gliding (repeats, go to bar). */
export const JUMP_DISTANCE = 0.75;

/** Going back by more than this (fraction of the screen) is a repeat or a jump: no glide back up. */
export const BACK_JUMP = 0.1;

/** Stiffness of the auto-scroll smoothing (1/s): the lag behind a target moving at v px/s is 2v/ω. */
export const FOLLOW_OMEGA = 5;

/** Pages to render around the reading page, and pages whose SVG is kept (others become placeholders). */
export function renderWindow(center: number, pageCount: number): { render: number[]; keep: number[] } {
  const range = (from: number, to: number) => {
    const pages: number[] = [];
    for (let n = Math.max(1, from); n <= Math.min(pageCount, to); n++) pages.push(n);
    return pages;
  };
  return { render: range(center - 1, center + 2), keep: range(center - 3, center + 4) };
}

/** scrollTop that puts the content height `y` at the reading line (fraction of the screen from the top). */
export function lineTarget(y: number, readingLine: number, screenHeight: number): number {
  return y - readingLine * screenHeight;
}

export interface FollowState {
  pos: number;
  vel: number;
}

/**
 * One step of the auto-scroll: critically damped spring towards `target` (exact solution over `dt` seconds, so it is
 * stable and does not oscillate whatever the frame rate); jumps when the target is far ahead or back up (repeat).
 */
export function followStep(s: FollowState, target: number, dt: number, screenHeight: number, omega = FOLLOW_OMEGA): FollowState {
  if (target - s.pos > JUMP_DISTANCE * screenHeight || s.pos - target > BACK_JUMP * screenHeight) return { pos: target, vel: 0 };
  const c1 = s.pos - target;
  const c2 = s.vel + omega * c1;
  const e = Math.exp(-omega * dt);
  return { pos: target + (c1 + c2 * dt) * e, vel: (c2 - omega * (c1 + c2 * dt)) * e };
}
