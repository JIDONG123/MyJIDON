# 多架构 Node 基础镜像（amd64 / arm64；龙芯请通过 build-arg NODE_IMAGE 覆盖，见 docker-compose.loongarch.yml）
ARG NODE_IMAGE=node:20-bookworm-slim
FROM ${NODE_IMAGE}

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# 生产依赖
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev && npm cache clean --force

COPY . .

RUN mkdir -p uploads

EXPOSE 3000

# 大赛要求：Node 原生 cluster，不用 PM2
CMD ["node", "cluster.js"]
