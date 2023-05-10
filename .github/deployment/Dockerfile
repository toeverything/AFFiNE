FROM golang:1.20-alpine as builder
RUN apk add --no-cache git
RUN mkdir /source
RUN git clone https://github.com/mattn/goreman /source/goreman && cd /source/goreman && git checkout tags/v0.3.15 && go get && go install
RUN chmod +x /go/bin/goreman

FROM ghcr.io/toeverything/cloud-self-hosted:mt-latest as cloud

FROM alpine:latest as relocate
WORKDIR /app
COPY ./apps/web/out ./dist
COPY ./.github/deployment/Caddyfile ./Caddyfile
COPY ./.github/deployment/Procfile ./Procfile
COPY --from=builder /go/bin/goreman ./goreman
COPY --from=cloud /app/affine ./cloud

FROM caddy:2.6.4-alpine
COPY --from=relocate /app .
EXPOSE 80
ENTRYPOINT ["/srv/goreman"]
CMD ["start"]
