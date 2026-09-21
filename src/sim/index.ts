/**
 * The sim's public surface. `src/render` and `tests` import from here, never from
 * a deep path, so the split between "state" and "drawing" stays visible in the
 * import lines (CLAUDE.md: no game logic in render code, ever).
 */

export * from './types';
export * from './constants';
export * from './units';
export * from './geometry';
export * from './bot';
export * from './lights';
export * from './game';
export * from './chapters';
