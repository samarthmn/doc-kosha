"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Duration of the `dk-row-flash` keyframe in `globals.css`. The ids are held
 * for exactly as long as the flash paints, then dropped so the class is not
 * left on a row that has stopped animating.
 */
const ROW_FLASH_DURATION_MS = 800;

interface RecentlyAddedRows {
  /** True while the row for this id should carry `dk-row-flash`. */
  isRecentlyAdded: (id: string) => boolean;
  /** Flash the rows for these ids. Safe to call with an empty array. */
  markRecentlyAdded: (ids: string[]) => void;
}

/**
 * Tracks rows a just-completed action inserted, so they can flash once and
 * settle.
 *
 * A newly created row would otherwise appear with no acknowledgement that it is
 * the one just made — especially in a list sorted so the new row is not where
 * the user was looking. The flash answers "which one is mine?" and then gets
 * out of the way.
 *
 * Purely a transient client cue: never persisted, never read by anything but
 * the row's own className.
 */
export const useRecentlyAddedRows = (): RecentlyAddedRows => {
  const [recentIds, setRecentIds] = useState<Set<string>>(() => new Set());
  const timeoutsRef = useRef<number[]>([]);

  // A row can be inserted and the surface unmounted before the flash ends
  // (create, then immediately navigate away), which would leave the timer to
  // set state on a torn-down component.
  useEffect(() => {
    const timeouts = timeoutsRef.current;
    return () => {
      timeouts.forEach((id) => window.clearTimeout(id));
    };
  }, []);

  const markRecentlyAdded = useCallback((ids: string[]): void => {
    if (ids.length === 0) return;

    setRecentIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.add(id));
      return next;
    });

    const timeoutId = window.setTimeout(() => {
      setRecentIds((prev) => {
        if (ids.every((id) => !prev.has(id))) return prev;
        const next = new Set(prev);
        ids.forEach((id) => next.delete(id));
        return next;
      });
      timeoutsRef.current = timeoutsRef.current.filter(
        (id) => id !== timeoutId,
      );
    }, ROW_FLASH_DURATION_MS);

    timeoutsRef.current.push(timeoutId);
  }, []);

  const isRecentlyAdded = useCallback(
    (id: string): boolean => recentIds.has(id),
    [recentIds],
  );

  return { isRecentlyAdded, markRecentlyAdded };
};
