# syntax=docker/dockerfile:1.7
# Mosaic self-host image, based on the official AFFiNE server.
# To compile this repository from source: docker build -f Dockerfile.from-source -t mosaic:local .

FROM ghcr.io/toeverything/affine:stable

ENV DEPLOYMENT_TYPE=selfhosted

EXPOSE 3010

CMD ["node", "./dist/main.js"]
