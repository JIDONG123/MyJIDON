# 云 ECS Docker — 前端构建产物镜像（供 nginx 网关 COPY dist）

FROM node:20-alpine AS build

WORKDIR /app

COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci || npm install

COPY frontend/ .
RUN npm run build

FROM nginx:1.24-alpine

RUN rm -f /etc/nginx/conf.d/default.conf

COPY deploy/docker/nginx.static.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
