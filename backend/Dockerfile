# syntax=docker/dockerfile:1

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS build
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S mosaic && adduser -S mosaic -G mosaic
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
RUN test ! -d /app/packages && test -f /app/dist/main.js
USER mosaic
EXPOSE 3010
HEALTHCHECK --interval=15s --timeout=5s --retries=20 --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:3010/info').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]
