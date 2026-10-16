# syntax=docker/dockerfile:1
# 把初始化脚本打进镜像并显式设置权限：直接挂载宿主机目录时，若目录权限为 700（如 umask 077），容器内 postgres 用户读不到脚本
FROM postgres:16-alpine
COPY --chmod=755 init/ /docker-entrypoint-initdb.d/
