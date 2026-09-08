import type { Transition } from "motion/react";

import { layoutTween } from "@/lib/motion";

const instantTransition: Transition = { duration: 0 };

type ResolveSidebarTransitionArgs = {
  hasToggledRail: boolean;
  prefersReducedMotion: boolean | null;
};

export const resolveSidebarTransition = ({
  hasToggledRail,
  prefersReducedMotion,
}: ResolveSidebarTransitionArgs): Transition =>
  !hasToggledRail || prefersReducedMotion ? instantTransition : layoutTween;

export const resolveSidebarMotionState = (isCollapsed: boolean) => ({
  width: isCollapsed ? 68 : 232,
  labelOpacity: isCollapsed ? 0 : 1,
  labelMaxWidth: isCollapsed ? 0 : 176,
  caretRotation: isCollapsed ? 180 : 0,
});
