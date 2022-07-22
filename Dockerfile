FROM node:16-alpine as builder
WORKDIR /app
COPY . .
RUN apk add g++ make python3 git
RUN npm i -g pnpm@7 && pnpm i --frozen-lockfile --store=node_modules/.pnpm-store && pnpm run build

FROM node:16-alpine as relocate
WORKDIR /app
COPY --from=builder /app/dist/apps/ligo-virgo ./dist
COPY --from=builder /app/Caddyfile ./
RUN rm ./dist/*.txt

# =============
# lisa image
# =============
FROM caddy:2.4.6-alpine as lisa
WORKDIR /app
COPY --from=relocate /app .

EXPOSE 3000
CMD ["caddy", "run"]