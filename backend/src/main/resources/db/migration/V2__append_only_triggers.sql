-- 日志只追加、已发布模板版本不可变、updated_at 维护、运行账号授权

-- ---------------------------------------------------------------------
-- 审批日志、审计日志、审批人变更记录：任何 UPDATE / DELETE 都报错
-- ---------------------------------------------------------------------
CREATE FUNCTION forbid_change() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_approval_log_append_only
    BEFORE UPDATE OR DELETE ON approval_log
    FOR EACH ROW EXECUTE FUNCTION forbid_change();

CREATE TRIGGER trg_audit_log_append_only
    BEFORE UPDATE OR DELETE ON audit_log
    FOR EACH ROW EXECUTE FUNCTION forbid_change();

CREATE TRIGGER trg_assignee_history_append_only
    BEFORE UPDATE OR DELETE ON assignee_history
    FOR EACH ROW EXECUTE FUNCTION forbid_change();

-- ---------------------------------------------------------------------
-- 模板版本：已发布 / 已归档版本的表单与节点配置不可修改，也不可删除；
-- 状态只能 DRAFT → PUBLISHED → ARCHIVED
-- ---------------------------------------------------------------------
CREATE FUNCTION guard_template_version() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD.status <> 'DRAFT' THEN
            RAISE EXCEPTION 'template version % is % and cannot be deleted', OLD.id, OLD.status;
        END IF;
        RETURN OLD;
    END IF;

    IF OLD.status <> 'DRAFT'
       AND (NEW.form_schema IS DISTINCT FROM OLD.form_schema
            OR NEW.node_config IS DISTINCT FROM OLD.node_config
            OR NEW.template_id <> OLD.template_id
            OR NEW.version_no <> OLD.version_no) THEN
        RAISE EXCEPTION 'template version % is % and immutable', OLD.id, OLD.status;
    END IF;

    IF NOT (NEW.status = OLD.status
            OR (OLD.status = 'DRAFT' AND NEW.status = 'PUBLISHED')
            OR (OLD.status = 'PUBLISHED' AND NEW.status = 'ARCHIVED')) THEN
        RAISE EXCEPTION 'illegal template version status change % -> %', OLD.status, NEW.status;
    END IF;
    RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_template_version_guard
    BEFORE UPDATE OR DELETE ON process_template_version
    FOR EACH ROW EXECUTE FUNCTION guard_template_version();

-- ---------------------------------------------------------------------
-- updated_at 自动维护
-- ---------------------------------------------------------------------
CREATE FUNCTION touch_updated_at() RETURNS trigger AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END $$ LANGUAGE plpgsql;

DO $$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY['department', 'sys_user', 'process_template', 'process_template_version',
                             'application', 'expense_type', 'attachment', 'sys_config']
    LOOP
        EXECUTE format('CREATE TRIGGER trg_%s_updated_at BEFORE UPDATE ON %I
                        FOR EACH ROW EXECUTE FUNCTION touch_updated_at()', t, t);
    END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- 运行账号 eas_app：只有 DML；日志表只有 INSERT 和 SELECT。
-- 部署环境中 eas_app 由 db/init 脚本创建，并通过 ALTER DEFAULT PRIVILEGES 自动获得新表权限；
-- 这里再显式授权一次，兼容迁移账号不是 eas_owner 的环境。没有 eas_app 的环境（如测试）跳过。
-- ---------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'eas_app') THEN
        EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO eas_app';
        EXECUTE 'GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO eas_app';
        EXECUTE 'REVOKE UPDATE, DELETE, TRUNCATE ON approval_log, audit_log, assignee_history FROM eas_app';
        EXECUTE 'REVOKE ALL ON flyway_schema_history FROM eas_app';
    END IF;
END $$;
