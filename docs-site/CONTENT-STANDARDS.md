# Documentation Content Standards

These are the editorial rules for everything under `content/`. A page that
breaks these rules is a claim-accuracy violation, not cosmetic debt.

## 1. One page, one task, in the user's words

- Every guide answers one task, phrased the way a user would ask it: "Create a
  data room", "Require an NDA before viewing" — not "The NDA subsystem".
- Steps come first. Concepts are linked, not inlined; a reader mid-task should
  never scroll past theory to find the next click.
- Screenshots, labels, button names, and quoted error messages must match the
  current product exactly. A stale screenshot or a renamed button is a bug.

## 2. Every claim matches the implementation

- A statement about what DocKosha does must be true of the code as shipped —
  not the roadmap, not the intent. When a claim names an outcome ("the bytes
  are never sent"), the page should be able to point at the server code that
  produces that outcome.
- Absolute security verbs — _blocked, prevents, impossible, guarantees, cannot
  be bypassed, always, never_ — require a named server-side enforcement point
  during documentation review. If you cannot name the enforcement point,
  weaken the wording — never the other way around.
- Prefer precise verbs over strong ones: "is refused with _…_" beats
  "is impossible".

## 3. Deterrents are labelled as deterrents

- A control that raises effort without removing capability — screenshot
  protection, dynamic watermarks as discouragement — must be described as a
  deterrent, in those words, on every page that mentions it.
- The screenshot-shield page states plainly what browsers cannot block
  (OS-level capture, cameras, capture tools that never touch the page). No
  page may imply otherwise, including by omission.

## 4. Honest limits on every relevant page

- Pages touching conversion state the format envelope and size caps, what
  fails closed, and exactly what the user sees when it does.
- Pages touching plans state the Free-plan limits that apply to the task at
  hand rather than linking away from the bad news.
- Failure behaviour is content, not an appendix: if an operation can refuse,
  the guide shows the refusal message and what to do about it.

## 5. Truthful help first, search assets second

- Guides may be shaped to match real queries ("how to create a virtual data
  room"), but only when the page genuinely completes that task. Truthful help
  first, SEO second.
- No keyword-stuffed filler pages, no pages that exist only to rank, no
  duplicated near-identical pages targeting query variants.

## Maintenance

- Docs ship in the same change as the feature they describe, as recorded in
  `CONTRIBUTING.md`. A feature change without its doc update is incomplete.
- The single-source rule holds: operator facts live in the repository `docs/`
  set and are rendered here via the sync (see `README.md`); product guides
  live in this tree. No fact exists in two places.
- Update the relevant documentation index in the same change that adds or
  moves a feature, so every shipped feature keeps at least one mapped page.
