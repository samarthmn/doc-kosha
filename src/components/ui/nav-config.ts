import {
  FileText,
  FolderOpen,
  Gear,
  Globe,
  House,
  Signature,
  Stamp,
  UsersThree,
} from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";

type NavItem = {
  label: string;
  href: string;
  /** Canonical icon rendered by every authenticated navigation shell. */
  icon: Icon;
  badge?: string;
  /** Short label used by the mobile bottom tab bar. */
  mobileLabel?: string;
  /** Visible to workspace owners only. */
  ownerOnly?: boolean;
  /** Requires documents access other than "none". */
  requiresDocumentsAccess?: boolean;
};

type NavAccess = {
  isOwner: boolean;
  canAccessDocuments: boolean;
};

/**
 * Single source of truth for authenticated navigation destinations.
 * Consumed by SidebarNav (desktop), BottomTabBar and MobileHeader (mobile).
 */
export const navItems: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: House, mobileLabel: "Home" },
  {
    label: "Documents",
    href: "/documents",
    icon: FileText,
    requiresDocumentsAccess: true,
  },
  { label: "Data Rooms", href: "/data-rooms", icon: FolderOpen },
  {
    label: "User groups",
    href: "/user-groups",
    icon: UsersThree,
    ownerOnly: true,
  },
  {
    label: "NDA Templates",
    href: "/nda-templates",
    icon: Signature,
    ownerOnly: true,
  },
  {
    label: "Custom domain",
    href: "/custom-domain",
    icon: Globe,
    ownerOnly: true,
  },
  {
    label: "Watermarks",
    href: "/custom-watermarks",
    icon: Stamp,
    ownerOnly: true,
  },
  { label: "Settings", href: "/settings", icon: Gear },
];

/** Hrefs promoted to primary tabs in the mobile bottom tab bar. */
export const bottomTabHrefs: string[] = [
  "/dashboard",
  "/documents",
  "/data-rooms",
  "/custom-domain",
  "/settings",
];

export const filterNavItems = (
  items: NavItem[],
  access: NavAccess,
): NavItem[] =>
  items.filter((item) => {
    if (item.ownerOnly && !access.isOwner) return false;
    if (item.requiresDocumentsAccess && !access.canAccessDocuments) {
      return false;
    }
    return true;
  });

export const routeTitle = (pathname: string): string => {
  const match = navItems.find((item) => pathname.startsWith(item.href));
  if (match) return match.label;
  if (pathname.startsWith("/branding")) return "Branding";
  return "DocKosha";
};
