import assert from "node:assert/strict";
import test from "node:test";

test("PDF load errors are classified from numeric status instead of message prose", async () => {
  const errorViewModule: unknown =
    await import("../../src/components/documents/pdf/PdfLoadErrorView");

  if (typeof errorViewModule !== "object" || errorViewModule === null) {
    assert.fail("PdfLoadErrorView must export a module object");
  }
  if (!("getInitialPdfLoadErrorKind" in errorViewModule)) {
    assert.fail("PdfLoadErrorView must expose its status classifier");
  }
  const classifier = errorViewModule.getInitialPdfLoadErrorKind;
  assert.equal(typeof classifier, "function");
  if (typeof classifier !== "function") return;

  assert.equal(
    classifier(
      {
        status: 404,
        message: "Unexpected server response (403) while retrieving PDF.",
      },
      "/api/public/links/file?documentId=doc-1",
    ),
    "missing",
    "the structured status must win over contradictory message prose",
  );
  assert.equal(
    classifier({ status: 403 }, "/api/public/links/file?documentId=doc-1"),
    "forbidden",
  );
  assert.equal(
    classifier({ status: 403 }, "https://files.example/doc.pdf"),
    "generic",
  );
  assert.equal(
    classifier(
      { message: "Unexpected server response (404) while retrieving PDF." },
      "/api/public/links/file?documentId=doc-1",
    ),
    "generic",
    "message prose must not be parsed as an HTTP status",
  );
});
