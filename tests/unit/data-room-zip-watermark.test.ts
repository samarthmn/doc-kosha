import assert from "node:assert/strict";
import test from "node:test";

import { unzipSync } from "fflate";

import {
  createStreamingZip,
  prepareZipEntries,
  type ZipDocument,
} from "@/server/dataRoomZip";

const document = (
  id: string,
  title: string,
  fileType: string,
): ZipDocument => ({
  id,
  title,
  file_type: fileType,
  storage_path: `workspace/${id}.${fileType}`,
  folder_id: null,
});

test("ZIP paths use PDF only for watermark-eligible documents", () => {
  const entries = prepareZipEntries({
    folders: [],
    documents: [
      document("office", "Proposal.docx", "docx"),
      document("video", "Demo.mp4", "mp4"),
      document("image", "Diagram.png", "png"),
    ],
    scope: { kind: "room" },
    forcePdfDocumentIds: new Set(["office"]),
  }).entries;

  assert.deepEqual(
    entries.map((entry) => entry.zipPath),
    ["Proposal.pdf", "Demo.mp4", "Diagram.png"],
  );
});

test("mixed watermarked documents and original media form a valid streamed ZIP", async () => {
  const prepared = prepareZipEntries({
    folders: [],
    documents: [
      document("office", "Proposal.docx", "docx"),
      document("video", "Demo.mp4", "mp4"),
    ],
    scope: { kind: "room" },
    forcePdfDocumentIds: new Set(["office"]),
  }).entries;
  const contents = new Map([
    ["Proposal.pdf", new TextEncoder().encode("watermarked-pdf")],
    ["Demo.mp4", new TextEncoder().encode("original-video")],
  ]);
  const archive = createStreamingZip(
    prepared.map((entry) => ({
      zipPath: entry.zipPath,
      open: async () => ({
        chunks: (async function* () {
          yield contents.get(entry.zipPath) ?? new Uint8Array();
        })(),
      }),
    })),
    { maxUncompressedBytes: 1024 },
  );
  const reader = archive.stream.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const result = await reader.read();
    if (result.done) break;
    chunks.push(result.value);
    totalBytes += result.value.byteLength;
  }
  await archive.completion;
  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  const files = unzipSync(bytes);
  assert.equal(
    new TextDecoder().decode(files["Proposal.pdf"]),
    "watermarked-pdf",
  );
  assert.equal(new TextDecoder().decode(files["Demo.mp4"]), "original-video");
});
