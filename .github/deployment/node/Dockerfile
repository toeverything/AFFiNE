FROM node:22-bookworm-slim

WORKDIR /app

# Copy built backend application
COPY packages/backend/server ./
COPY node_modules /app/node_modules

# Copy built frontend applications
COPY packages/frontend/apps/web/dist ./static
COPY packages/frontend/admin/dist ./static/admin
COPY packages/frontend/apps/mobile/dist ./static/mobile

RUN apt-get update && \
  apt-get install -y --no-install-recommends openssl && \
  rm -rf /var/lib/apt/lists/*

CMD ["node", "./dist/main.js"]
