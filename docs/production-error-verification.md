# Production error verification

## PDF viewer

Render events may originate from a full page view or a high-resolution detail
view. Only the active viewer's canonical page view may update overlays or
replace text-selection listeners. Detail canvases continue rendering normally.
The engine browser suite exercises high-resolution rendering, rotated pages,
watermarks and comment selection on document and data-room links. Unit coverage
also rejects events from a previous document instance.

## Browser-injected Android logger

The browser Sentry filter requires the exact native-bridge failure message and
`app://navigation_performance_logger_android` source. Additional frames must be
known Sentry wrappers. An application frame, unknown source, different message,
or additional exception retains the report.

Browser filtering happens before server-side source mapping. If a minified
application chunk contains a Sentry wrapper, that frame is still unknown at this
point and the event is retained. Do not broaden the filter to all application
chunks or use this classifier as proof that an earlier mapped incident is resolved.

## Unrecognized Server Actions

A missing-action report does not establish that a real client used an old
release. The server adds only these finite diagnostic categories:

- Request method: `post` or `other`.
- Transport: `multipart` or `other`.
- Action header: `present` or `absent`.
- Deployment: `absent`, `unknown`, `match`, or `mismatch`.

These categories exclude raw headers, action identifiers, bodies, credentials
and IP addresses. Existing Sentry capture continues. Testimonial submission
failures retain entered values and clear the pending state. Next's exported
missing-action classifier enables explicit reload guidance. Reloading is a user
action and never automatically replays a submission.

Verify invalid multipart requests independently from a real form loaded from
an older build. For deployment verification, load the form from staging build A,
deploy staging build B, and submit the retained form while recording only the
safe categories and outcome. Check that the served assets, action manifest and
runtime belong to the expected build. Do not add a shared action encryption key
without evidence of a deployment configuration defect. See
[Next.js missing-action guidance](https://nextjs.org/docs/messages/failed-to-find-server-action).

## Conservative redaction warnings

Text redaction removes individual glyphs where the provider can safely resolve
them. Images, vectors, reused resources and text with unsupported font geometry
may require removing more visible content than the selected rectangle. A warning
requires explicit confirmation before saving; cancellation retains the selection
for refinement. The saved PDF must remove underlying content, not merely cover it.

Telemetry contains allowlisted counts for text, inline images, image and form
XObjects, vector paths, shading, annotations and widgets. Legacy or unrecognized
warning metadata contributes to `unknown`. Document-derived messages and unknown
kind strings are never copied into this telemetry.

## Release evidence

A passing recovery test does not classify an earlier production incident. Keep
unreproduced document incidents open until authorized private input has been
verified against the packaged release. Validate the actual staging deployment
before promoting it, then exercise the affected production flows and inspect
fresh events against the deployed release. An absence of events alone is not
proof of a fix.

The extended data-room viewer check exposed an existing comments API limitation:
public room links have no standalone `document_id`, while the comments service
currently requires one on the link. Those comment saves return `LINK_NOT_FOUND`.
The viewer regression verifies detail rendering, selection, composer placement
and watermarks on the room route; persisted comment anchors are verified on
internal and standalone document-link routes. This change does not claim to fix
the separate room-comment authorization path.
