-- 草稿允许保存未填完的业务字段；这些跨字段规则由提交校验统一执行。
-- 原约束未关联申请状态，会在用户还未填完说明/线上链接时阻止保存草稿。
ALTER TABLE purchase_quote DROP CONSTRAINT ck_quote_online_url;
ALTER TABLE purchase_detail DROP CONSTRAINT ck_purchase_single_source;
ALTER TABLE expense_item DROP CONSTRAINT ck_expense_no_invoice_reason;
