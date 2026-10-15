-- 三个内置模板：采购、差旅、报销。表单字段固定（form_schema.builtin），管理员只能调整节点配置。
-- 条件可引用系统变量 amountCents（统计金额，分）与 naturalDays（差旅自然日）。

INSERT INTO process_template (id, code, name, description, category, biz_type, enabled, sort_order)
OVERRIDING SYSTEM VALUE VALUES
    (1, 'BUILTIN_PURCHASE', '采购申请', '采购明细、至少两家报价比较、采购选择', 'BUILTIN', 'PURCHASE', true, 1),
    (2, 'BUILTIN_TRAVEL',   '差旅申请', '出差行程、预算与同行人员',             'BUILTIN', 'TRAVEL',   true, 2),
    (3, 'BUILTIN_EXPENSE',  '报销申请', '费用明细与票据，可关联差旅 / 采购单',   'BUILTIN', 'EXPENSE',  true, 3)
ON CONFLICT DO NOTHING;

INSERT INTO process_template_version (id, template_id, version_no, status, form_schema, node_config, change_note,
                                      published_at)
OVERRIDING SYSTEM VALUE VALUES
    -- ① 部门负责人审批 → ② 财务预算审查（财务审批人主办人）→ ③ 企业负责人审批（仅当金额 ≥ 5 万元）
    (1, 1, 1, 'PUBLISHED', '{"builtin": "PURCHASE", "fields": []}', '{
      "nodes": [
        {"nodeKey": "N1", "name": "部门负责人审批",
         "approverRule": {"type": "APPLICANT_DEPT_HEAD"},
         "fallbackRule": {"type": "ROLE", "roleCode": "ENTERPRISE_HEAD"}},
        {"nodeKey": "N2", "name": "财务预算审查",
         "approverRule": {"type": "ROLE", "roleCode": "FINANCE_APPROVER"},
         "fallbackRule": {"type": "ROLE", "roleCode": "ENTERPRISE_HEAD"}},
        {"nodeKey": "N3", "name": "企业负责人审批",
         "approverRule": {"type": "ROLE", "roleCode": "ENTERPRISE_HEAD"},
         "condition": {"logic": "AND", "rules": [{"var": "amountCents", "op": "GTE", "value": "5000000"}]}}
      ]}', '初始版本', now()),
    -- ① 部门负责人审批 → ② 企业负责人审批（仅当预算 ≥ 2 万元或天数 > 7）
    (2, 2, 1, 'PUBLISHED', '{"builtin": "TRAVEL", "fields": []}', '{
      "nodes": [
        {"nodeKey": "N1", "name": "部门负责人审批",
         "approverRule": {"type": "APPLICANT_DEPT_HEAD"},
         "fallbackRule": {"type": "ROLE", "roleCode": "ENTERPRISE_HEAD"}},
        {"nodeKey": "N2", "name": "企业负责人审批",
         "approverRule": {"type": "ROLE", "roleCode": "ENTERPRISE_HEAD"},
         "condition": {"logic": "OR", "rules": [
           {"var": "amountCents", "op": "GTE", "value": "2000000"},
           {"var": "naturalDays", "op": "GT", "value": "7"}]}}
      ]}', '初始版本', now()),
    -- ① 部门负责人审批 → ② 财务审核（财务审批人主办人）→ ③ 企业负责人审批（仅当金额 ≥ 1 万元）
    (3, 3, 1, 'PUBLISHED', '{"builtin": "EXPENSE", "fields": []}', '{
      "nodes": [
        {"nodeKey": "N1", "name": "部门负责人审批",
         "approverRule": {"type": "APPLICANT_DEPT_HEAD"},
         "fallbackRule": {"type": "ROLE", "roleCode": "ENTERPRISE_HEAD"}},
        {"nodeKey": "N2", "name": "财务审核",
         "approverRule": {"type": "ROLE", "roleCode": "FINANCE_APPROVER"},
         "fallbackRule": {"type": "ROLE", "roleCode": "ENTERPRISE_HEAD"}},
        {"nodeKey": "N3", "name": "企业负责人审批",
         "approverRule": {"type": "ROLE", "roleCode": "ENTERPRISE_HEAD"},
         "condition": {"logic": "AND", "rules": [{"var": "amountCents", "op": "GTE", "value": "1000000"}]}}
      ]}', '初始版本', now())
ON CONFLICT DO NOTHING;

UPDATE process_template SET current_version_id = id WHERE id IN (1, 2, 3) AND current_version_id IS NULL;

SELECT setval(pg_get_serial_sequence('process_template', 'id'), GREATEST((SELECT max(id) FROM process_template), 1));
SELECT setval(pg_get_serial_sequence('process_template_version', 'id'),
              GREATEST((SELECT max(id) FROM process_template_version), 1));
