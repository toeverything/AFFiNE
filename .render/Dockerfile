# syntax=docker/dockerfile:1.7

# Adds a start script to the published AFFiNE image. Nothing is compiled here.
FROM ghcr.io/toeverything/affine:stable

COPY --chmod=0755 start.sh /usr/local/bin/render-start.sh

CMD ["/usr/local/bin/render-start.sh"]
