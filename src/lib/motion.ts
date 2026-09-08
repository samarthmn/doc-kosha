import type { MotionProps, Transition } from "motion/react";

/**
 * Shared motion vocabulary for the app UI (Motion for React — motion.dev).
 *
 * Philosophy: motion confirms causality — something moves only because the
 * user did something. Durations stay in the 120–250ms band, enter eases out,
 * exit eases in.
 *
 * Tweens only. Springs are deliberately absent: their overshoot reads bouncy
 * against Nocturne's calm dark ground, so no call site should introduce
 * `type: "spring"`.
 *
 * Reduced motion is handled globally by `<MotionConfig reducedMotion="user">`
 * in `MainLayout` — Motion then drops transform and layout animations while
 * keeping opacity. A call site that coordinates opacity with a non-transform
 * property must still resolve its whole transition to zero; the desktop
 * sidebar does this for width, labels, and its caret. CSS-side effects stay
 * behind the `prefers-reduced-motion` gate in `globals.css`.
 *
 * Import these instead of writing inline durations, so retiming the app is a
 * single-file change.
 */

/**
 * Enter easing: decelerate into place.
 *
 * Deliberately not exported. Call sites spread one of the named variants below
 * instead of assembling `{ duration, ease }` inline, so every timing stays in
 * this file and there is nothing to import a bare curve for.
 */
const EASE_OUT = [0, 0, 0.2, 1] as const;

/** Exit easing: accelerate away. */
const EASE_IN = [0.4, 0, 1, 1] as const;

/**
 * Position changes driven by `layout` / `layoutId` — the settings tab
 * underline, the collapsing sidebar, panel resizes.
 */
export const layoutTween: Transition = {
  duration: 0.2,
  ease: EASE_OUT,
};

/** Content arriving: fade + a short rise. Page and tab mounts. */
export const riseIn: Pick<MotionProps, "initial" | "animate" | "transition"> = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.18, ease: EASE_OUT },
};

/** Content resolving in place: opacity only. Skeleton handoffs, crossfades. */
export const fadeIn: Pick<MotionProps, "initial" | "animate" | "transition"> = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  transition: { duration: 0.15, ease: EASE_OUT },
};

/** Content leaving: opacity only, slightly quicker than it arrived. */
export const exitFade: Pick<MotionProps, "exit"> = {
  exit: { opacity: 0, transition: { duration: 0.15, ease: EASE_IN } },
};

/**
 * Disclosure of a collapsible region — folder tree branches.
 *
 * `height: "auto"` is measured by Motion rather than animated as a raw pixel
 * value, so the region opens to its real content height.
 *
 * `overflow: hidden` is scoped to the tween and released through
 * `transitionEnd` rather than pinned in a class. A permanent clip would crop
 * the focus outlines of controls sitting flush against the region's edge —
 * `outline-offset-2` plus a 2px stroke reaches exactly as far as a row's own
 * padding — and a clipped focus ring is an accessibility regression. Clipping
 * is only needed while the height is mid-transition, which is precisely the
 * window this covers.
 */
export const heightExpand: Pick<
  MotionProps,
  "initial" | "animate" | "exit" | "transition"
> = {
  initial: { height: 0, opacity: 0, overflow: "hidden" },
  animate: {
    height: "auto",
    opacity: 1,
    overflow: "hidden",
    transitionEnd: { overflow: "visible" },
  },
  exit: { height: 0, opacity: 0, overflow: "hidden" },
  transition: { duration: 0.2, ease: EASE_OUT },
};

/**
 * Determinate progress fill.
 *
 * The one sanctioned `width` animation: progress is a magnitude, so it must
 * read as continuous travel rather than discrete jumps. Linear easing keeps
 * the rate honest — an eased fill implies a speed the transfer isn't doing.
 */
export const progressTween: Transition = {
  duration: 0.3,
  ease: "linear",
};
