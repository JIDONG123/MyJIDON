ARG NODE_IMAGE=node:20-bookworm-slim
FROM ${NODE_IMAGE} AS build

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .

ARG VITE_PROXY_TARGET=http://backend:3000
ENV VITE_PROXY_TARGET=${VITE_PROXY_TARGET}

RUN npm run build

# 运行阶段：vite preview（内置代理 /api、/uploads、/socket.io → 后端，无需 Nginx）
FROM ${NODE_IMAGE}

WORKDIR /app

ENV NODE_ENV=production

# preview 需 vite 本体（含 proxy）；镜像体积略大，但无需 Nginx
COPY package.json package-lock.json* vite.config.js ./
RUN npm ci && npm cache clean --force

COPY --from=build /app/dist ./dist

EXPOSE 5173

CMD ["npm", "run", "preview", "--", "--host", "0.0.0.0", "--port", "5173"]
