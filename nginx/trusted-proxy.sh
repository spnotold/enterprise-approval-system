#!/bin/sh
# 把 TRUSTED_PROXY_CIDR（可信前置代理的地址/网段，逗号或空格分隔）转成 nginx realip 配置。
# 未设置或为空时不生成任何配置：$remote_addr 保持为直连对端地址，客户端伪造的 X-Forwarded-For 不起作用。
# 设置后，只有来自这些地址的请求才会采信 X-Forwarded-For，$remote_addr 被还原为其中最右侧的非可信地址。
set -eu
set -f

conf=/etc/nginx/conf.d/00-real-ip.conf
rm -f "$conf"

lines=
for cidr in $(printf '%s' "${TRUSTED_PROXY_CIDR:-}" | tr ',' ' '); do
  case $cidr in
    *[!0-9A-Fa-f:./]*)
      echo "$0: TRUSTED_PROXY_CIDR 含非法地址: $cidr" >&2
      exit 1
      ;;
    */0)
      echo "$0: 警告: $cidr 会信任所有来源，客户端可伪造 IP" >&2
      ;;
  esac
  lines="${lines}set_real_ip_from ${cidr};
"
done

[ -n "$lines" ] || exit 0

printf '# 由 trusted-proxy.sh 根据 TRUSTED_PROXY_CIDR 生成\n%sreal_ip_header X-Forwarded-For;\nreal_ip_recursive on;\n' "$lines" > "$conf"
echo "$0: 已启用 realip，可信前置代理: $(printf '%s' "${TRUSTED_PROXY_CIDR}" | tr ',' ' ')"
