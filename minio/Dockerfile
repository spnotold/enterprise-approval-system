# syntax=docker/dockerfile:1
# MinIO 官方已停止发布二进制与镜像（Docker Hub / quay.io 均不可拉取），这里从固定提交的源码编译 minio 与 mc。
# 一个镜像同时供 minio（对象存储）和 minio-init（mc 建桶、建专用账号）使用。
FROM golang:1.25-alpine AS build
ENV CGO_ENABLED=0 GOTOOLCHAIN=local GOBIN=/out
ARG MINIO_VERSION=v0.0.0-20260212201848-7aac2a2c5b7c
ARG MC_VERSION=v0.0.0-20251106162529-77f82e18b540
RUN --mount=type=cache,target=/go/pkg/mod --mount=type=cache,target=/root/.cache/go-build \
    go install -trimpath -ldflags "-s -w" github.com/minio/minio@${MINIO_VERSION} && \
    go install -trimpath -ldflags "-s -w" github.com/minio/mc@${MC_VERSION}

FROM alpine:3.20
RUN apk add --no-cache ca-certificates tzdata
COPY --from=build /out/minio /out/mc /usr/bin/
EXPOSE 9000
ENTRYPOINT ["minio"]
