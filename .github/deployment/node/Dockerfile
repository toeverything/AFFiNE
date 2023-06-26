FROM node:18-bookworm-slim

COPY ./apps/server /app
WORKDIR /app

RUN apt-get update && \
  apt-get install -y --no-install-recommends openssl && \
  rm -rf /var/lib/apt/lists/*

CMD ["node", "--es-module-specifier-resolution=node", "./dist/index.js"]
