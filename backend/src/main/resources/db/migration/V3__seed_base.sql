-- 基础数据：角色、权限点、费用类型、系统配置、部门。可重复执行（ON CONFLICT DO NOTHING）

-- ---------------------------------------------------------------------
-- 5 个内置角色
-- ---------------------------------------------------------------------
INSERT INTO role (id, code, name, description, builtin, sort_order) OVERRIDING SYSTEM VALUE VALUES
    (1, 'EMPLOYEE',         '员工',       '注册审核通过后自动授予：发起与管理本人申请', true, 1),
    (2, 'DEPT_HEAD',        '部门负责人', '随“设置部门负责人”同步授予：本部门申请查询与统计', true, 2),
    (3, 'FINANCE_APPROVER', '财务审批人', '财务预算审查、报销财务审核节点的候选人', true, 3),
    (4, 'ENTERPRISE_HEAD',  '企业负责人', '高金额节点审批', true, 4),
    (5, 'SYS_ADMIN',        '系统管理员', '用户、部门、授权、模板、配置、审计、转办；不能审批', true, 5)
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------
-- 权限点
-- ---------------------------------------------------------------------
INSERT INTO permission (code, name, category, description) VALUES
    ('APP_CREATE',     '发起申请',         'BIZ',   '新建、编辑、提交、撤回本人申请'),
    ('TASK_HANDLE',    '处理待办',         'BIZ',   '查看待办与已办；能批哪张单只看具体待办的被分配人'),
    ('APP_READ_DEPT',  '本部门申请查询',   'BIZ',   '查看本人负责部门的非草稿申请'),
    ('STATS_DEPT',     '本部门统计',       'BIZ',   '本人负责部门的统计'),
    ('ADMIN_USER',     '用户管理',         'ADMIN', '注册审核、启用停用、角色授予与回收、重置密码'),
    ('ADMIN_DEPT',     '部门管理',         'ADMIN', '部门增改删、设置负责人'),
    ('ADMIN_GRANT',    '授权管理',         'ADMIN', '数据范围授权的创建与回收'),
    ('ADMIN_TEMPLATE', '流程模板管理',     'ADMIN', '模板设计、发布、启停'),
    ('ADMIN_CONFIG',   '系统配置',         'ADMIN', '系统配置、费用类型、邮件投递记录'),
    ('ADMIN_AUDIT',    '审计日志',         'ADMIN', '查看管理审计日志'),
    ('ADMIN_TRANSFER', '待办监控与转办',   'ADMIN', '查看待办元数据，转办需填写原因')
ON CONFLICT DO NOTHING;

INSERT INTO role_permission (role_id, permission_id)
SELECT r.id, p.id
  FROM (VALUES
        ('EMPLOYEE', 'APP_CREATE'), ('EMPLOYEE', 'TASK_HANDLE'),
        ('DEPT_HEAD', 'APP_CREATE'), ('DEPT_HEAD', 'TASK_HANDLE'),
        ('DEPT_HEAD', 'APP_READ_DEPT'), ('DEPT_HEAD', 'STATS_DEPT'),
        ('FINANCE_APPROVER', 'APP_CREATE'), ('FINANCE_APPROVER', 'TASK_HANDLE'),
        ('ENTERPRISE_HEAD', 'APP_CREATE'), ('ENTERPRISE_HEAD', 'TASK_HANDLE'),
        -- 系统管理员只有管理类权限点，服务端拒绝把 TASK_HANDLE 授予 SYS_ADMIN
        ('SYS_ADMIN', 'ADMIN_USER'), ('SYS_ADMIN', 'ADMIN_DEPT'), ('SYS_ADMIN', 'ADMIN_GRANT'),
        ('SYS_ADMIN', 'ADMIN_TEMPLATE'), ('SYS_ADMIN', 'ADMIN_CONFIG'), ('SYS_ADMIN', 'ADMIN_AUDIT'),
        ('SYS_ADMIN', 'ADMIN_TRANSFER')
       ) AS rp(role_code, perm_code)
  JOIN role r ON r.code = rp.role_code
  JOIN permission p ON p.code = rp.perm_code
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------
-- 费用类型：预置五种，管理员可新增和停用；被引用后不能删除
-- ---------------------------------------------------------------------
INSERT INTO expense_type (code, name, enabled, sort_order) VALUES
    ('TRANSPORT', '交通', true, 1),
    ('LODGING',   '住宿', true, 2),
    ('MEAL',      '餐饮', true, 3),
    ('OFFICE',    '办公', true, 4),
    ('OTHER',     '其他', true, 5)
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------
-- 系统配置
-- ---------------------------------------------------------------------
INSERT INTO sys_config (config_key, config_value, description) VALUES
    ('flow.fallback_approver',     'DEPT:FIN', '兜底审批人：DEPT:部门编码（该部门负责人）或 USER:用户ID；替代规则仍为申请人本人时使用'),
    ('upload.max_files_per_app',   '50',       '每张申请最多附件数'),
    ('upload.max_total_mb_per_app','100',      '每张申请附件总大小上限（MB）'),
    ('task.overdue_hours',         '48',       '待办超过该时长未处理时提醒（小时），节点可单独配置'),
    ('mail.enabled',               'true',     '是否发送邮件提醒（站内通知不受影响）')
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------
-- 初始部门：研发部、市场部、财务部、总经办（负责人在用户建立后设置）
-- ---------------------------------------------------------------------
INSERT INTO department (id, code, name, sort_order) OVERRIDING SYSTEM VALUE VALUES
    (1, 'RD',  '研发部', 1),
    (2, 'MKT', '市场部', 2),
    (3, 'FIN', '财务部', 3),
    (4, 'GM',  '总经办', 4)
ON CONFLICT DO NOTHING;

SELECT setval(pg_get_serial_sequence('role', 'id'), GREATEST((SELECT max(id) FROM role), 1));
SELECT setval(pg_get_serial_sequence('department', 'id'), GREATEST((SELECT max(id) FROM department), 1));
