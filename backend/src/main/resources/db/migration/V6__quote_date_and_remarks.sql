-- 采购报价日期及采购单、报销单备注；草稿允许报价日期为空，提交时统一校验。
ALTER TABLE purchase_quote ADD COLUMN quote_date DATE;
ALTER TABLE purchase_detail ADD COLUMN remark VARCHAR(500);
ALTER TABLE expense_detail ADD COLUMN remark VARCHAR(500);
