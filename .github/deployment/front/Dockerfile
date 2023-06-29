FROM openresty/openresty:1.21.4.1-0-buster
WORKDIR /app
COPY ./apps/web/out ./dist
COPY ./.github/deployment/front/nginx.conf /usr/local/openresty/nginx/conf/nginx.conf
COPY ./.github/deployment/front/affine.nginx.conf /etc/nginx/conf.d/affine.nginx.conf

RUN mkdir -p /var/log/nginx && \
  rm /etc/nginx/conf.d/default.conf

EXPOSE 8080
CMD ["/usr/local/openresty/bin/openresty", "-g", "daemon off;"]
