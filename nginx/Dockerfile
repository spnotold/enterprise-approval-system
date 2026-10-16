# syntax=docker/dockerfile:1
# 构建上下文为项目根目录
FROM node:20-alpine AS web
WORKDIR /web
COPY frontend/package*.json ./
RUN --mount=type=cache,target=/root/.npm npm ci
COPY frontend/ .
RUN npm run build

FROM node:20-alpine AS h5
WORKDIR /mobile
COPY mobile/package*.json ./
RUN --mount=type=cache,target=/root/.npm npm ci
COPY mobile/ .
RUN npm run build:h5

FROM nginx:1.27-alpine
COPY nginx/default.conf /etc/nginx/conf.d/default.conf
# 启动时按 TRUSTED_PROXY_CIDR 生成 realip 配置；未设置时不生成，行为与不加此脚本相同
COPY --chmod=755 nginx/trusted-proxy.sh /docker-entrypoint.d/25-trusted-proxy.sh
COPY --from=web /web/dist /usr/share/nginx/html/web
COPY --from=h5 /mobile/dist/build/h5 /usr/share/nginx/html/h5
EXPOSE 80
