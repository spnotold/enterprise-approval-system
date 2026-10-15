# 构建上下文为项目根目录
FROM node:20-alpine AS web
WORKDIR /web
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ .
RUN npm run build

FROM node:20-alpine AS h5
WORKDIR /mobile
COPY mobile/package*.json ./
RUN npm install
COPY mobile/ .
RUN npm run build:h5

FROM nginx:1.27-alpine
COPY nginx/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=web /web/dist /usr/share/nginx/html
COPY --from=h5 /mobile/dist/build/h5 /usr/share/nginx/html/m
EXPOSE 80
