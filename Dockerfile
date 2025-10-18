FROM node:20 AS build
WORKDIR /app
COPY . .
RUN corepack enable && corepack prepare pnpm@latest --activate \
 && pnpm i --frozen-lockfile && pnpm build

FROM node:20
WORKDIR /app
ENV NODE_ENV=production
VOLUME ["/app/data"]
COPY --from=build /app/.output ./
CMD ["node","server/index.js"]
