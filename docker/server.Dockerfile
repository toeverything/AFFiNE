FROM node:18-alpine AS builder
WORKDIR /usr/src/app

# Install build deps
RUN apk add --no-cache python3 make g++ git

COPY package.json yarn.lock tsconfig.json ./
COPY packages/backend/server/package.json packages/backend/server/
COPY packages/backend/server/ ./packages/backend/server/

RUN yarn install --frozen-lockfile --network-concurrency 1

WORKDIR /usr/src/app/packages/backend/server
RUN yarn build || true

FROM node:18-alpine AS runner
WORKDIR /usr/src/app
RUN apk add --no-cache ca-certificates

COPY --from=builder /usr/src/app/packages/backend/server/dist ./dist
COPY --from=builder /usr/src/app/packages/backend/server/node_modules ./node_modules
COPY packages/backend/server/package.json ./package.json

ENV NODE_ENV=production
EXPOSE 3010

CMD ["node", "dist/main.js"]
