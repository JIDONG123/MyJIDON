# 云 ECS Docker — 对外网关 Nginx

ARG FRONTEND_IMAGE=smart-grading-frontend:latest
FROM ${FRONTEND_IMAGE} AS fe_assets

FROM nginx:1.24-alpine

RUN rm -f /etc/nginx/conf.d/default.conf

COPY deploy/docker/nginx.default.conf /etc/nginx/conf.d/default.conf
COPY --from=fe_assets /usr/share/nginx/html /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
