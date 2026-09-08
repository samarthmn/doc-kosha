"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

const REVIEW_MODAL_PARAM = "modal";
const REVIEW_MODAL_VALUE = "review";
const REVIEW_SOURCE_PARAM = "review_source";

type SearchParamValue = string | null | undefined;

const toParams = (value: { toString(): string } | null | undefined) =>
  new URLSearchParams(value?.toString() ?? "");

const withQuery = (
  pathname: string | null,
  params: URLSearchParams,
): string => {
  const nextPathname = pathname ?? "/";
  const query = params.toString();
  return query ? `${nextPathname}?${query}` : nextPathname;
};

const isReviewModalRequested = (
  searchParams: { get(name: string): string | null } | null | undefined,
): boolean => searchParams?.get(REVIEW_MODAL_PARAM) === REVIEW_MODAL_VALUE;

const getReviewSource = (
  searchParams: { get(name: string): string | null } | null | undefined,
): string | null => searchParams?.get(REVIEW_SOURCE_PARAM) ?? null;

const createReviewModalUrl = (options: {
  pathname: string | null;
  searchParams: { toString(): string } | null | undefined;
  reviewSource?: string | null;
  overrides?: Record<string, SearchParamValue>;
}): string => {
  const params = toParams(options.searchParams);

  for (const [key, value] of Object.entries(options.overrides ?? {})) {
    if (!value) {
      params.delete(key);
      continue;
    }
    params.set(key, value);
  }

  params.set(REVIEW_MODAL_PARAM, REVIEW_MODAL_VALUE);
  if (options.reviewSource) {
    params.set(REVIEW_SOURCE_PARAM, options.reviewSource);
  } else {
    params.delete(REVIEW_SOURCE_PARAM);
  }

  return withQuery(options.pathname, params);
};

const createReviewModalCloseUrl = (options: {
  pathname: string | null;
  searchParams: { toString(): string } | null | undefined;
}): string => {
  const params = toParams(options.searchParams);
  params.delete(REVIEW_MODAL_PARAM);
  params.delete(REVIEW_SOURCE_PARAM);
  return withQuery(options.pathname, params);
};

export const useReviewModal = () => {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const openReviewModal = (options?: {
    reviewSource?: string | null;
    overrides?: Record<string, SearchParamValue>;
  }): void => {
    router.replace(
      createReviewModalUrl({
        pathname,
        searchParams,
        reviewSource: options?.reviewSource,
        overrides: options?.overrides,
      }),
    );
  };

  const closeReviewModal = (): void => {
    router.replace(
      createReviewModalCloseUrl({
        pathname,
        searchParams,
      }),
    );
  };

  return {
    isOpen: isReviewModalRequested(searchParams),
    pathname,
    reviewSource: getReviewSource(searchParams),
    openReviewModal,
    closeReviewModal,
  };
};
