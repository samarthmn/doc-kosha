import assert from "node:assert/strict";
import { test } from "node:test";
import {
  bottomTabHrefs,
  filterNavItems,
  navItems,
} from "@/components/ui/nav-config";

const ownerAccess = {
  isOwner: true,
  canAccessDocuments: true,
};

const filteredHrefs = (isOwner: boolean): string[] =>
  filterNavItems(navItems, { ...ownerAccess, isOwner }).map(
    (item) => item.href,
  );

test("single-edition navigation shows custom domains and user groups", () => {
  const hrefs = filteredHrefs(true);

  assert.equal(hrefs.includes("/custom-domain"), true);
  assert.equal(hrefs.includes("/user-groups"), true);
});

test("single-edition navigation keeps custom domains owner-only", () => {
  assert.equal(filteredHrefs(false).includes("/custom-domain"), false);
});

test("single-edition mobile navigation preserves the custom domain tab", () => {
  const mobileHrefs = filteredHrefs(true).filter((href) =>
    bottomTabHrefs.includes(href),
  );

  assert.equal(bottomTabHrefs.includes("/custom-domain"), true);
  assert.equal(mobileHrefs.includes("/custom-domain"), true);
});
