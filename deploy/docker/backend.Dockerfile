# 云 ECS Docker — 后端 API（amd64 官方 Node 镜像）

FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080
ENV TZ=Asia/Shanghai

COPY backend/package.json backend/package-lock.json* ./
RUN npm ci --omit=dev || npm install --omit=dev \
    && npm cache clean --force

COPY backend/ .

RUN mkdir -p uploads logs logs/socket tmp

EXPOSE 8080

CMD ["node", "cluster.js"]
