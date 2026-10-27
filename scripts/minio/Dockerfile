# MinIO Community Edition is source-only; do not depend on removed registry images.
FROM golang:1.26-alpine AS minio-build
ENV CGO_ENABLED=0
RUN go install github.com/minio/minio@RELEASE.2025-10-15T17-29-55Z

FROM golang:1.26-alpine AS mc-build
ENV CGO_ENABLED=0
RUN go install github.com/minio/mc@RELEASE.2025-08-13T08-35-41Z

FROM alpine:3.23 AS runtime
RUN apk add --no-cache ca-certificates curl

FROM runtime AS minio
COPY --from=minio-build /go/bin/minio /usr/bin/minio
ENTRYPOINT ["/usr/bin/minio"]
CMD ["server", "/data", "--console-address", ":9001"]

FROM runtime AS mc
COPY --from=mc-build /go/bin/mc /usr/bin/mc
ENTRYPOINT ["/usr/bin/mc"]
