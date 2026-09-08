import assert from "node:assert/strict";
import test from "node:test";

import { NextRequest } from "next/server";

import { extractClientIp } from "@/server/requestIp";

const requestWithHeaders = (headers: HeadersInit): NextRequest =>
  new NextRequest("https://app.dockosha.com/api/public/links/file", {
    headers,
  });

test("rejects leading-zero IPv4 input", () => {
  const request = requestWithHeaders({
    "x-real-ip": "127.000.000.001",
  });

  assert.equal(extractClientIp(request), null);
});

test("skips a leading-zero IPv4 forwarded address and selects a later valid address", () => {
  const request = requestWithHeaders({
    "x-forwarded-for": "127.000.000.001, 203.0.113.7",
  });

  assert.equal(extractClientIp(request), "203.0.113.7");
});
