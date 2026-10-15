-- 演示数据：账号、角色、部门负责人、数据范围授权、两个自定义模板。仅 demo profile 加载。
-- 可重复执行：已存在的行保持不变（ON CONFLICT DO NOTHING / WHERE NOT EXISTS）。
-- 示例申请由 DemoDataInitializer 调用真实的保存、提交、审批流程生成，保证快照、待办、日志与线上一致。
-- 统一初始密码 Demo@2026（BCrypt）。

INSERT INTO sys_user (id, username, real_name, email, password_hash, dept_id, requested_dept_id, status, reviewed_by, reviewed_at)
OVERRIDING SYSTEM VALUE VALUES
    (1,  'admin',          '系统管理员', 'admin@eas.local',          '{bcrypt}$2a$10$/BojysoQHAKnVx9OVFhJTeKvHPWS6dV4CcNSn0DCaDYfJI4JXx0ye', 4, NULL, 'ACTIVE',  NULL, now()),
    (2,  'ceo_zhao',       '赵总',       'ceo_zhao@eas.local',       '{bcrypt}$2a$10$/BojysoQHAKnVx9OVFhJTeKvHPWS6dV4CcNSn0DCaDYfJI4JXx0ye', 4, NULL, 'ACTIVE',  1, now()),
    (3,  'rd_head_li',     '李研',       'rd_head_li@eas.local',     '{bcrypt}$2a$10$/BojysoQHAKnVx9OVFhJTeKvHPWS6dV4CcNSn0DCaDYfJI4JXx0ye', 1, NULL, 'ACTIVE',  1, now()),
    (4,  'rd_emp_wang',    '王工',       'rd_emp_wang@eas.local',    '{bcrypt}$2a$10$/BojysoQHAKnVx9OVFhJTeKvHPWS6dV4CcNSn0DCaDYfJI4JXx0ye', 1, NULL, 'ACTIVE',  1, now()),
    (5,  'rd_emp_chen',    '陈工',       'rd_emp_chen@eas.local',    '{bcrypt}$2a$10$/BojysoQHAKnVx9OVFhJTeKvHPWS6dV4CcNSn0DCaDYfJI4JXx0ye', 1, NULL, 'ACTIVE',  1, now()),
    (6,  'mkt_head_sun',   '孙经理',     'mkt_head_sun@eas.local',   '{bcrypt}$2a$10$/BojysoQHAKnVx9OVFhJTeKvHPWS6dV4CcNSn0DCaDYfJI4JXx0ye', 2, NULL, 'ACTIVE',  1, now()),
    (7,  'mkt_emp_zhou',   '周敏',       'mkt_emp_zhou@eas.local',   '{bcrypt}$2a$10$/BojysoQHAKnVx9OVFhJTeKvHPWS6dV4CcNSn0DCaDYfJI4JXx0ye', 2, NULL, 'ACTIVE',  1, now()),
    (8,  'fin_head_qian',  '钱会计',     'fin_head_qian@eas.local',  '{bcrypt}$2a$10$/BojysoQHAKnVx9OVFhJTeKvHPWS6dV4CcNSn0DCaDYfJI4JXx0ye', 3, NULL, 'ACTIVE',  1, now()),
    (9,  'fin_auditor_wu', '吴审',       'fin_auditor_wu@eas.local', '{bcrypt}$2a$10$/BojysoQHAKnVx9OVFhJTeKvHPWS6dV4CcNSn0DCaDYfJI4JXx0ye', 3, NULL, 'ACTIVE',  1, now()),
    (10, 'pending_he',     '何晓',       'pending_he@eas.local',     '{bcrypt}$2a$10$/BojysoQHAKnVx9OVFhJTeKvHPWS6dV4CcNSn0DCaDYfJI4JXx0ye', NULL, 2, 'PENDING', NULL, NULL)
ON CONFLICT DO NOTHING;

SELECT setval(pg_get_serial_sequence('sys_user', 'id'), GREATEST((SELECT max(id) FROM sys_user), 1));

-- 角色：除管理员外都有员工角色；管理员只有管理类权限点，不能审批
INSERT INTO user_role (user_id, role_id, is_primary_handler, granted_by)
SELECT ur.user_id, r.id, ur.is_primary, 1
  FROM (VALUES
        (1, 'SYS_ADMIN', false),
        (2, 'EMPLOYEE', false), (2, 'DEPT_HEAD', false), (2, 'ENTERPRISE_HEAD', true),
        (3, 'EMPLOYEE', false), (3, 'DEPT_HEAD', false),
        (4, 'EMPLOYEE', false),
        (5, 'EMPLOYEE', false),
        (6, 'EMPLOYEE', false), (6, 'DEPT_HEAD', false),
        (7, 'EMPLOYEE', false),
        (8, 'EMPLOYEE', false), (8, 'DEPT_HEAD', false), (8, 'FINANCE_APPROVER', false),
        (9, 'EMPLOYEE', false), (9, 'FINANCE_APPROVER', true)
       ) AS ur(user_id, role_code, is_primary)
  JOIN role r ON r.code = ur.role_code
ON CONFLICT DO NOTHING;

-- 部门负责人：研发部李研、市场部孙经理、财务部钱会计、总经办赵总（只填空缺，不覆盖管理员后来的调整）
UPDATE department d SET head_user_id = h.user_id
  FROM (VALUES ('RD', 3), ('MKT', 6), ('FIN', 8), ('GM', 2)) AS h(code, user_id)
 WHERE d.code = h.code AND d.head_user_id IS NULL;

-- 数据范围授权：赵总企业范围查询与财务统计；钱会计财务统计
INSERT INTO data_scope_grant (user_id, permission_code, scope_type, reason, granted_by)
SELECT g.user_id, g.code, 'ALL', g.reason, 1
  FROM (VALUES
        (2, 'APP_READ',       '企业负责人查看全公司申请'),
        (2, 'FIN_STATS_READ', '企业负责人查看财务统计'),
        (8, 'FIN_STATS_READ', '财务负责人查看财务统计')
       ) AS g(user_id, code, reason)
 WHERE NOT EXISTS (SELECT 1 FROM data_scope_grant x
                    WHERE x.user_id = g.user_id AND x.permission_code = g.code AND x.revoked_at IS NULL);

-- ---------------------------------------------------------------------
-- 自定义模板：请假申请（部门负责人 → 企业负责人，请假超过 3 天时）、用章申请（部门负责人 → 印章管理员钱会计）
-- ---------------------------------------------------------------------
INSERT INTO process_template (id, code, name, description, category, biz_type, enabled, sort_order, created_by)
OVERRIDING SYSTEM VALUE VALUES
    (4, 'LEAVE', '请假申请', '事假、病假、年假等；超过 3 天需企业负责人审批', 'CUSTOM', 'CUSTOM', true, 10, 1),
    (5, 'SEAL',  '用章申请', '使用公司公章、合同章、财务章',                'CUSTOM', 'CUSTOM', true, 11, 1)
ON CONFLICT DO NOTHING;

INSERT INTO process_template_version (id, template_id, version_no, status, form_schema, node_config, change_note,
                                      created_by, published_by, published_at)
OVERRIDING SYSTEM VALUE VALUES
    (4, 4, 1, 'PUBLISHED', '{
      "fields": [
        {"key": "leaveType", "label": "请假类型", "type": "RADIO", "required": true,
         "options": [{"value": "PERSONAL", "label": "事假"}, {"value": "SICK", "label": "病假"},
                     {"value": "ANNUAL", "label": "年假"}, {"value": "OTHER", "label": "其他"}]},
        {"key": "startDate", "label": "开始日期", "type": "DATE", "required": true},
        {"key": "endDate", "label": "结束日期", "type": "DATE", "required": true, "rules": {"notBefore": "startDate"}},
        {"key": "days", "label": "请假天数", "type": "NUMBER", "required": true,
         "help": "以半天为单位", "rules": {"min": "0.5", "max": "365", "precision": 1, "step": "0.5"}},
        {"key": "reason", "label": "请假事由", "type": "TEXTAREA", "required": true, "rules": {"minLength": 2, "maxLength": 500}}
      ]}', '{
      "nodes": [
        {"nodeKey": "N1", "name": "部门负责人审批",
         "approverRule": {"type": "APPLICANT_DEPT_HEAD"},
         "fallbackRule": {"type": "ROLE", "roleCode": "ENTERPRISE_HEAD"}},
        {"nodeKey": "N2", "name": "企业负责人审批",
         "approverRule": {"type": "ROLE", "roleCode": "ENTERPRISE_HEAD"},
         "condition": {"logic": "AND", "rules": [{"var": "days", "op": "GT", "value": "3"}]}}
      ]}', '初始版本', 1, 1, now()),
    (5, 5, 1, 'PUBLISHED', '{
      "fields": [
        {"key": "sealType", "label": "印章类型", "type": "RADIO", "required": true,
         "options": [{"value": "OFFICIAL", "label": "公章"}, {"value": "CONTRACT", "label": "合同章"},
                     {"value": "FINANCE", "label": "财务章"}]},
        {"key": "documentName", "label": "文件名称", "type": "TEXT", "required": true, "rules": {"maxLength": 100}},
        {"key": "copies", "label": "用印份数", "type": "NUMBER", "required": true, "rules": {"min": "1", "max": "100", "precision": 0}},
        {"key": "useDate", "label": "用印日期", "type": "DATE", "required": true, "rules": {"earliest": "TODAY"}},
        {"key": "purpose", "label": "用途说明", "type": "TEXTAREA", "required": true, "rules": {"minLength": 2, "maxLength": 500}},
        {"key": "document", "label": "用印文件", "type": "ATTACHMENT", "rules": {"maxCount": 5, "allowedTypes": ["application/pdf", "image/jpeg", "image/png"], "maxSizeMb": 10}}
      ]}', '{
      "nodes": [
        {"nodeKey": "N1", "name": "部门负责人审批",
         "approverRule": {"type": "APPLICANT_DEPT_HEAD"},
         "fallbackRule": {"type": "ROLE", "roleCode": "ENTERPRISE_HEAD"}},
        {"nodeKey": "N2", "name": "印章管理员审批",
         "approverRule": {"type": "SPECIFIED_USER", "userId": 8},
         "fallbackRule": {"type": "ROLE", "roleCode": "ENTERPRISE_HEAD"}}
      ]}', '初始版本', 1, 1, now())
ON CONFLICT DO NOTHING;

UPDATE process_template SET current_version_id = id WHERE id IN (4, 5) AND current_version_id IS NULL;

SELECT setval(pg_get_serial_sequence('process_template', 'id'), GREATEST((SELECT max(id) FROM process_template), 1));
SELECT setval(pg_get_serial_sequence('process_template_version', 'id'),
              GREATEST((SELECT max(id) FROM process_template_version), 1));
