#!/bin/bash
# 数据卷首次初始化时由 postgres 镜像执行，执行身份为 eas_owner
set -euo pipefail

psql -v ON_ERROR_STOP=1 -v app_pwd="$EAS_APP_PASSWORD" \
     --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<'SQL'
CREATE ROLE eas_app LOGIN PASSWORD :'app_pwd';
GRANT CONNECT ON DATABASE eas TO eas_app;
GRANT USAGE ON SCHEMA public TO eas_app;   -- 不授予 CREATE

-- 之后 eas_owner（Flyway）创建的表和序列自动授权给 eas_app
ALTER DEFAULT PRIVILEGES FOR ROLE eas_owner IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO eas_app;
ALTER DEFAULT PRIVILEGES FOR ROLE eas_owner IN SCHEMA public
    GRANT USAGE, SELECT ON SEQUENCES TO eas_app;
SQL
