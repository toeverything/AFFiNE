# Wraps the published AFFiNE image with a start script that runs migrations
# before the server. Nothing is compiled here.
FROM ghcr.io/toeverything/affine:stable

COPY start.sh /usr/local/bin/render-start.sh
RUN chmod +x /usr/local/bin/render-start.sh

CMD ["/usr/local/bin/render-start.sh"]
