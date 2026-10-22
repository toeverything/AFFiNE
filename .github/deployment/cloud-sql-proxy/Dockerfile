FROM golang:1.27-bookworm AS build

ENV CGO_ENABLED=0
RUN go install -trimpath -ldflags="-s -w" github.com/GoogleCloudPlatform/cloud-sql-proxy/v2@v2.26.2

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /go/bin/cloud-sql-proxy /cloud-sql-proxy
ENTRYPOINT ["/cloud-sql-proxy"]
