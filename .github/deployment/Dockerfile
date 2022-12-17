FROM nginx:alpine

COPY ./packages/app/out /usr/share/nginx/html

COPY ./.github/deployment/nginx.conf /etc/nginx/conf.d/default.conf
