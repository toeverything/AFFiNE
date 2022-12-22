FROM node:16-alpine as relocate
WORKDIR /app
COPY ./packages/app/out ./dist
COPY ./.github/deployment/Caddyfile ./Caddyfile

FROM caddy:2.6.2-alpine
ARG API_SERVER
WORKDIR /app
COPY --from=relocate /app .

EXPOSE 80
ENV API_SERVER=$API_SERVER
CMD ["caddy", "run"]