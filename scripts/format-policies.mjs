import fs from "node:fs";
import path from "node:path";

const workspaceRoot = path.resolve();

const policyHtmlFiles = [
  path.join(workspaceRoot, "src", "app", "privacy-policy", "policy.html"),
  path.join(workspaceRoot, "src", "app", "cookie-policy", "policy.html"),
  path.join(workspaceRoot, "src", "app", "terms-and-conditions", "policy.html"),
];

const BLOCK_TAGS = new Set([
  "article",
  "aside",
  "blockquote",
  "br",
  "div",
  "dl",
  "dt",
  "dd",
  "fieldset",
  "figcaption",
  "figure",
  "footer",
  "form",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "hr",
  "li",
  "main",
  "nav",
  "ol",
  "p",
  "pre",
  "section",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "tr",
  "ul",
]);

const parseTagName = (tag) => {
  const match = tag.match(/^<\/?\s*([a-zA-Z0-9-]+)/);
  return match?.[1]?.toLowerCase() ?? null;
};

const shouldInsertNewlineBetweenTags = (leftTag, rightTag) => {
  if (!leftTag || !rightTag) return false;

  const leftName = parseTagName(leftTag);
  const rightName = parseTagName(rightTag);
  if (!leftName || !rightName) return false;

  return BLOCK_TAGS.has(leftName) || BLOCK_TAGS.has(rightName);
};

const formatPolicyHtml = (html) => {
  let output = "";
  let index = 0;

  while (index < html.length) {
    const nextOpen = html.indexOf("<", index);
    if (nextOpen === -1) {
      output += html.slice(index);
      break;
    }

    output += html.slice(index, nextOpen);
    const nextClose = html.indexOf(">", nextOpen);
    if (nextClose === -1) {
      output += html.slice(nextOpen);
      break;
    }

    const tag = html.slice(nextOpen, nextClose + 1);
    output += tag;
    index = nextClose + 1;

    if (html[index] !== "<") {
      continue;
    }

    const rightClose = html.indexOf(">", index);
    const rightTag =
      rightClose === -1 ? html.slice(index) : html.slice(index, rightClose + 1);

    if (shouldInsertNewlineBetweenTags(tag, rightTag)) {
      output += "\n";
    }
  }

  return output.trimEnd() + "\n";
};

let changedCount = 0;

for (const filePath of policyHtmlFiles) {
  const before = fs.readFileSync(filePath, "utf8");
  const after = formatPolicyHtml(before);

  if (before === after) continue;

  fs.writeFileSync(filePath, after, "utf8");
  changedCount += 1;
}

if (changedCount > 0) {
  // Script is intentionally silent unless it errors.
}
