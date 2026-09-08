export const resolveMobileShellScrollTop = (
  historyPathname: string | null,
  nextPathname: string,
  savedTop: number | undefined,
): number => {
  if (historyPathname !== nextPathname) return 0;
  return savedTop ?? 0;
};

type MobileShellScrollRestoration = {
  scrollTop: number;
  pendingTop: number | null;
};

export const resolveMobileShellScrollRestoration = (
  historyPathname: string | null,
  nextPathname: string,
  savedTop: number | undefined,
  maxScrollTop: number,
): MobileShellScrollRestoration => {
  const targetTop = resolveMobileShellScrollTop(
    historyPathname,
    nextPathname,
    savedTop,
  );

  if (targetTop <= maxScrollTop) {
    return {
      scrollTop: targetTop,
      pendingTop: null,
    };
  }

  return {
    scrollTop: 0,
    pendingTop: targetTop,
  };
};
