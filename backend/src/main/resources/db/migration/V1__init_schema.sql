-- 企业审批系统：全部表、约束、索引、序列
-- 约定：主键 BIGINT IDENTITY；时间 TIMESTAMPTZ；金额 BIGINT（分，列名以 _cents 结尾）；
--       枚举 VARCHAR + CHECK；半结构化配置 JSONB。外键默认 RESTRICT，只有随主单生灭的明细用 CASCADE。

-- =====================================================================
-- 组织与权限
-- =====================================================================

CREATE TABLE department (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code          VARCHAR(32)  NOT NULL,
    name          VARCHAR(50)  NOT NULL,
    head_user_id  BIGINT,
    sort_order    INT          NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    deleted_at    TIMESTAMPTZ,
    CONSTRAINT uk_department_code UNIQUE (code)
);
CREATE UNIQUE INDEX uk_department_name ON department (name) WHERE deleted_at IS NULL;

CREATE TABLE sys_user (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    username            VARCHAR(32)  NOT NULL,
    real_name           VARCHAR(50)  NOT NULL,
    email               VARCHAR(100) NOT NULL,
    password_hash       VARCHAR(100) NOT NULL,
    dept_id             BIGINT REFERENCES department (id),
    requested_dept_id   BIGINT REFERENCES department (id),
    status              VARCHAR(16)  NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'ACTIVE', 'DISABLED', 'REJECTED')),
    token_version       INT          NOT NULL DEFAULT 0,
    failed_login_count  INT          NOT NULL DEFAULT 0,
    first_failed_at     TIMESTAMPTZ,
    locked_until        TIMESTAMPTZ,
    email_notify        BOOLEAN      NOT NULL DEFAULT true,
    last_login_at       TIMESTAMPTZ,
    reviewed_by         BIGINT REFERENCES sys_user (id),
    reviewed_at         TIMESTAMPTZ,
    review_note         VARCHAR(500),
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    -- 启用的账号必须有主属部门
    CONSTRAINT ck_user_active_dept CHECK (status <> 'ACTIVE' OR dept_id IS NOT NULL)
);
CREATE UNIQUE INDEX uk_user_username ON sys_user (lower(username));
CREATE UNIQUE INDEX uk_user_email ON sys_user (lower(email));
CREATE INDEX idx_user_dept ON sys_user (dept_id);
CREATE INDEX idx_user_status ON sys_user (status);

ALTER TABLE department
    ADD CONSTRAINT fk_department_head FOREIGN KEY (head_user_id) REFERENCES sys_user (id);

CREATE TABLE role (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code         VARCHAR(32)  NOT NULL,
    name         VARCHAR(50)  NOT NULL,
    description  VARCHAR(200),
    builtin      BOOLEAN      NOT NULL DEFAULT true,
    sort_order   INT          NOT NULL DEFAULT 0,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT uk_role_code UNIQUE (code)
);

CREATE TABLE permission (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code         VARCHAR(32)  NOT NULL,
    name         VARCHAR(50)  NOT NULL,
    category     VARCHAR(16)  NOT NULL CHECK (category IN ('BIZ', 'ADMIN')),
    description  VARCHAR(200),
    CONSTRAINT uk_permission_code UNIQUE (code)
);

CREATE TABLE role_permission (
    role_id        BIGINT NOT NULL REFERENCES role (id) ON DELETE CASCADE,
    permission_id  BIGINT NOT NULL REFERENCES permission (id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE user_role (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id             BIGINT      NOT NULL REFERENCES sys_user (id),
    role_id             BIGINT      NOT NULL REFERENCES role (id) ON DELETE CASCADE,
    is_primary_handler  BOOLEAN     NOT NULL DEFAULT false,
    granted_by          BIGINT REFERENCES sys_user (id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uk_user_role UNIQUE (user_id, role_id)
);
-- 每个角色至多一名主办人
CREATE UNIQUE INDEX uk_user_role_primary ON user_role (role_id) WHERE is_primary_handler;

CREATE TABLE data_scope_grant (
    id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id          BIGINT       NOT NULL REFERENCES sys_user (id),
    permission_code  VARCHAR(32)  NOT NULL
        CHECK (permission_code IN ('APP_READ', 'FIN_STATS_READ', 'BIZ_CONTENT_READ')),
    scope_type       VARCHAR(8)   NOT NULL CHECK (scope_type IN ('DEPT', 'ALL')),
    dept_id          BIGINT REFERENCES department (id),
    valid_from       TIMESTAMPTZ  NOT NULL DEFAULT now(),
    valid_until      TIMESTAMPTZ,
    reason           VARCHAR(500) NOT NULL,
    granted_by       BIGINT       NOT NULL REFERENCES sys_user (id),
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
    revoked_at       TIMESTAMPTZ,
    revoked_by       BIGINT REFERENCES sys_user (id),
    revoke_reason    VARCHAR(500),
    CONSTRAINT ck_grant_scope CHECK ((scope_type = 'DEPT') = (dept_id IS NOT NULL)),
    CONSTRAINT ck_grant_period CHECK (valid_until IS NULL OR valid_until > valid_from)
);
CREATE INDEX idx_grant_user ON data_scope_grant (user_id) WHERE revoked_at IS NULL;

CREATE TABLE refresh_token (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id      BIGINT       NOT NULL REFERENCES sys_user (id),
    token_hash   CHAR(64)     NOT NULL, -- SHA-256，十六进制
    family_id    UUID         NOT NULL,
    client       VARCHAR(16)  NOT NULL CHECK (client IN ('WEB', 'MOBILE')),
    expires_at   TIMESTAMPTZ  NOT NULL,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    rotated_at   TIMESTAMPTZ,           -- 已被轮换（再次出现即判定泄露）
    revoked_at   TIMESTAMPTZ,
    user_agent   VARCHAR(300),
    ip           VARCHAR(64),
    CONSTRAINT uk_refresh_token_hash UNIQUE (token_hash)
);
CREATE INDEX idx_refresh_token_user ON refresh_token (user_id);
CREATE INDEX idx_refresh_token_family ON refresh_token (family_id);

-- =====================================================================
-- 模板与流程
-- =====================================================================

CREATE TABLE process_template (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code                VARCHAR(50)  NOT NULL,
    name                VARCHAR(50)  NOT NULL,
    description         VARCHAR(500),
    category            VARCHAR(16)  NOT NULL CHECK (category IN ('BUILTIN', 'CUSTOM')),
    biz_type            VARCHAR(16)  NOT NULL CHECK (biz_type IN ('PURCHASE', 'TRAVEL', 'EXPENSE', 'CUSTOM')),
    enabled             BOOLEAN      NOT NULL DEFAULT false,
    current_version_id  BIGINT,
    sort_order          INT          NOT NULL DEFAULT 0,
    created_by          BIGINT REFERENCES sys_user (id),
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT uk_template_code UNIQUE (code),
    CONSTRAINT ck_template_category CHECK ((category = 'CUSTOM') = (biz_type = 'CUSTOM'))
);

CREATE TABLE process_template_dept (
    template_id  BIGINT NOT NULL REFERENCES process_template (id) ON DELETE CASCADE,
    dept_id      BIGINT NOT NULL REFERENCES department (id),
    PRIMARY KEY (template_id, dept_id)
);

CREATE TABLE process_template_version (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    template_id   BIGINT       NOT NULL REFERENCES process_template (id),
    version_no    INT          NOT NULL,
    status        VARCHAR(16)  NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PUBLISHED', 'ARCHIVED')),
    form_schema   JSONB        NOT NULL,
    node_config   JSONB        NOT NULL,
    change_note   VARCHAR(500),
    created_by    BIGINT REFERENCES sys_user (id),
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    published_by  BIGINT REFERENCES sys_user (id),
    published_at  TIMESTAMPTZ,
    CONSTRAINT uk_template_version UNIQUE (template_id, version_no)
);
-- 每个模板至多一个草稿版本、一个发布版本
CREATE UNIQUE INDEX uk_template_version_draft ON process_template_version (template_id) WHERE status = 'DRAFT';
CREATE UNIQUE INDEX uk_template_version_published ON process_template_version (template_id) WHERE status = 'PUBLISHED';

ALTER TABLE process_template
    ADD CONSTRAINT fk_template_current_version
        FOREIGN KEY (current_version_id) REFERENCES process_template_version (id);

-- =====================================================================
-- 申请与业务明细
-- =====================================================================

CREATE SEQUENCE app_no_seq START 1;

CREATE TABLE application (
    id                     BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    app_no                 VARCHAR(32)  NOT NULL,
    type                   VARCHAR(16)  NOT NULL CHECK (type IN ('PURCHASE', 'TRAVEL', 'EXPENSE', 'CUSTOM')),
    template_id            BIGINT       NOT NULL REFERENCES process_template (id),
    template_version_id    BIGINT REFERENCES process_template_version (id), -- 提交时绑定
    title                  VARCHAR(100),
    applicant_id           BIGINT       NOT NULL REFERENCES sys_user (id),
    dept_id                BIGINT REFERENCES department (id),               -- 提交时固化
    status                 VARCHAR(16)  NOT NULL DEFAULT 'DRAFT'
        CHECK (status IN ('DRAFT', 'IN_APPROVAL', 'APPROVED', 'REJECTED', 'WITHDRAWN')),
    amount_cents           BIGINT CHECK (amount_cents >= 0),
    current_node_seq       INT,
    source_application_id  BIGINT REFERENCES application (id),
    version                INT          NOT NULL DEFAULT 0,
    submitted_at           TIMESTAMPTZ,
    finished_at            TIMESTAMPTZ,
    created_at             TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at             TIMESTAMPTZ  NOT NULL DEFAULT now(),
    deleted_at             TIMESTAMPTZ,
    CONSTRAINT uk_application_no UNIQUE (app_no),
    -- 只有草稿可以软删除
    CONSTRAINT ck_application_soft_delete CHECK (deleted_at IS NULL OR status = 'DRAFT'),
    CONSTRAINT ck_application_submitted CHECK (status = 'DRAFT' OR (submitted_at IS NOT NULL AND dept_id IS NOT NULL
                                                                   AND template_version_id IS NOT NULL)),
    CONSTRAINT ck_application_current_node CHECK (status = 'IN_APPROVAL' OR current_node_seq IS NULL)
);
CREATE INDEX idx_application_applicant ON application (applicant_id, status);
CREATE INDEX idx_application_dept ON application (dept_id, submitted_at) WHERE status <> 'DRAFT';
CREATE INDEX idx_application_status ON application (status, submitted_at);
CREATE INDEX idx_application_source ON application (source_application_id);

-- 采购

CREATE TABLE purchase_quote (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    application_id      BIGINT        NOT NULL REFERENCES application (id) ON DELETE CASCADE,
    seq                 INT           NOT NULL,
    supplier_name       VARCHAR(100),
    channel             VARCHAR(8)    NOT NULL DEFAULT 'OFFLINE' CHECK (channel IN ('ONLINE', 'OFFLINE')),
    quote_amount_cents  BIGINT CHECK (quote_amount_cents > 0),
    url                 VARCHAR(500),
    description         VARCHAR(1000),
    attachment_ids      JSONB         NOT NULL DEFAULT '[]',
    CONSTRAINT uk_purchase_quote_seq UNIQUE (application_id, seq),
    -- 线上报价必须有购买链接
    CONSTRAINT ck_quote_online_url CHECK (channel <> 'ONLINE' OR (url IS NOT NULL AND btrim(url) <> ''))
);
-- 同一申请内供应商不重复（去空白、不区分大小写）
CREATE UNIQUE INDEX uk_purchase_quote_supplier ON purchase_quote (application_id, lower(btrim(supplier_name)));

CREATE TABLE purchase_detail (
    application_id               BIGINT PRIMARY KEY REFERENCES application (id) ON DELETE CASCADE,
    reason                       VARCHAR(1000),
    budget_limit_cents           BIGINT CHECK (budget_limit_cents > 0),
    expected_arrival_date        DATE,
    single_source                BOOLEAN NOT NULL DEFAULT false,
    single_source_reason         VARCHAR(1000),
    single_source_attachment_ids JSONB   NOT NULL DEFAULT '[]',
    selected_quote_id            BIGINT REFERENCES purchase_quote (id) ON DELETE SET NULL,
    selection_reason             VARCHAR(500),
    not_lowest_reason            VARCHAR(500),
    attachment_ids               JSONB   NOT NULL DEFAULT '[]',
    items_total_cents            BIGINT  NOT NULL DEFAULT 0,
    -- 单一来源必须有说明
    CONSTRAINT ck_purchase_single_source CHECK (NOT single_source
        OR (single_source_reason IS NOT NULL AND btrim(single_source_reason) <> ''))
);

CREATE TABLE purchase_item (
    id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    application_id    BIGINT        NOT NULL REFERENCES application (id) ON DELETE CASCADE,
    seq               INT           NOT NULL,
    name              VARCHAR(100),
    spec              VARCHAR(200),
    unit              VARCHAR(20),
    quantity          NUMERIC(12, 3) CHECK (quantity > 0),
    unit_price_cents  BIGINT CHECK (unit_price_cents >= 0),
    amount_cents      BIGINT,
    remark            VARCHAR(200),
    CONSTRAINT uk_purchase_item_seq UNIQUE (application_id, seq)
);

-- 差旅

CREATE TABLE travel_detail (
    application_id  BIGINT PRIMARY KEY REFERENCES application (id) ON DELETE CASCADE,
    origin          VARCHAR(100),
    destination     VARCHAR(100),
    start_time      TIMESTAMPTZ,
    end_time        TIMESTAMPTZ,
    natural_days    INT,            -- 服务端按上海时区自然日计算
    duration_hours  NUMERIC(6, 1),  -- 服务端计算，保留一位小数
    transport       VARCHAR(16) CHECK (transport IN ('PLANE', 'TRAIN', 'BUS', 'CAR', 'OTHER')),
    purpose         VARCHAR(1000),
    budget_cents    BIGINT CHECK (budget_cents >= 0),
    attachment_ids  JSONB NOT NULL DEFAULT '[]',
    CONSTRAINT ck_travel_time CHECK (end_time >= start_time)
);

CREATE TABLE travel_companion (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    application_id  BIGINT NOT NULL REFERENCES application (id) ON DELETE CASCADE,
    seq             INT    NOT NULL,
    user_id         BIGINT REFERENCES sys_user (id),
    name            VARCHAR(50),
    CONSTRAINT uk_travel_companion_seq UNIQUE (application_id, seq),
    -- 系统用户与文本姓名二选一
    CONSTRAINT ck_companion_one_of CHECK ((user_id IS NULL) <> (name IS NULL))
);

-- 报销

CREATE TABLE expense_type (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code        VARCHAR(32) NOT NULL,
    name        VARCHAR(50) NOT NULL,
    enabled     BOOLEAN     NOT NULL DEFAULT true,
    sort_order  INT         NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uk_expense_type_code UNIQUE (code)
);

CREATE TABLE expense_detail (
    application_id      BIGINT PRIMARY KEY REFERENCES application (id) ON DELETE CASCADE,
    description         VARCHAR(1000),
    independent_reason  VARCHAR(500),
    total_amount_cents  BIGINT NOT NULL DEFAULT 0 CHECK (total_amount_cents >= 0)
);

CREATE TABLE expense_item (
    id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    application_id     BIGINT  NOT NULL REFERENCES application (id) ON DELETE CASCADE,
    seq                INT     NOT NULL,
    expense_type_id    BIGINT REFERENCES expense_type (id),
    occur_date         DATE,
    purpose            VARCHAR(200),
    amount_cents       BIGINT CHECK (amount_cents > 0),
    no_invoice         BOOLEAN NOT NULL DEFAULT false,
    no_invoice_reason  VARCHAR(300),
    CONSTRAINT uk_expense_item_seq UNIQUE (application_id, seq),
    -- 无票明细必须有原因
    CONSTRAINT ck_expense_no_invoice_reason CHECK (NOT no_invoice
        OR (no_invoice_reason IS NOT NULL AND btrim(no_invoice_reason) <> ''))
);

-- =====================================================================
-- 附件
-- =====================================================================

CREATE TABLE attachment (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    uploader_id     BIGINT       NOT NULL REFERENCES sys_user (id),
    application_id  BIGINT REFERENCES application (id) ON DELETE SET NULL,
    ref_type        VARCHAR(32)  NOT NULL,
    original_name   VARCHAR(255) NOT NULL,
    storage_key     VARCHAR(100) NOT NULL,
    content_type    VARCHAR(100) NOT NULL,
    size_bytes      BIGINT       NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 10485760),
    sha256          CHAR(64)     NOT NULL,
    status          VARCHAR(16)  NOT NULL DEFAULT 'TEMP' CHECK (status IN ('TEMP', 'BOUND', 'DELETED')),
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    bound_at        TIMESTAMPTZ,
    deleted_at      TIMESTAMPTZ,
    CONSTRAINT uk_attachment_storage_key UNIQUE (storage_key),
    CONSTRAINT ck_attachment_bound CHECK (status <> 'BOUND' OR application_id IS NOT NULL)
);
CREATE INDEX idx_attachment_app ON attachment (application_id);
CREATE INDEX idx_attachment_temp ON attachment (updated_at) WHERE status = 'TEMP';
CREATE INDEX idx_attachment_uploader ON attachment (uploader_id, status);

CREATE TABLE expense_invoice (
    id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    application_id   BIGINT      NOT NULL REFERENCES application (id) ON DELETE CASCADE,
    expense_item_id  BIGINT      NOT NULL REFERENCES expense_item (id) ON DELETE CASCADE,
    seq              INT         NOT NULL,
    attachment_id    BIGINT      NOT NULL REFERENCES attachment (id),
    file_sha256      CHAR(64)    NOT NULL,
    invoice_no       VARCHAR(64),
    invoice_no_norm  VARCHAR(64), -- 去空格、转大写
    CONSTRAINT uk_invoice_item_seq UNIQUE (expense_item_id, seq)
);
-- 同一报销单内，同一文件或同一票据号不能被使用两次
CREATE UNIQUE INDEX uk_invoice_app_sha ON expense_invoice (application_id, file_sha256);
CREATE UNIQUE INDEX uk_invoice_app_no ON expense_invoice (application_id, invoice_no_norm)
    WHERE invoice_no_norm IS NOT NULL;
-- 跨单疑似重复查询
CREATE INDEX idx_invoice_sha ON expense_invoice (file_sha256);
CREATE INDEX idx_invoice_no_norm ON expense_invoice (invoice_no_norm) WHERE invoice_no_norm IS NOT NULL;

CREATE TABLE expense_relation (
    expense_application_id  BIGINT NOT NULL REFERENCES application (id) ON DELETE CASCADE,
    related_application_id  BIGINT NOT NULL REFERENCES application (id),
    PRIMARY KEY (expense_application_id, related_application_id),
    CONSTRAINT ck_expense_relation_self CHECK (expense_application_id <> related_application_id)
);
CREATE INDEX idx_expense_relation_related ON expense_relation (related_application_id);

-- 自定义表单

CREATE TABLE custom_form_data (
    application_id       BIGINT PRIMARY KEY REFERENCES application (id) ON DELETE CASCADE,
    template_version_id  BIGINT NOT NULL REFERENCES process_template_version (id), -- 填写时所依据的版本
    form_values          JSONB  NOT NULL DEFAULT '{}'
);

-- =====================================================================
-- 流程实例
-- =====================================================================

CREATE TABLE flow_instance (
    id                   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    application_id       BIGINT      NOT NULL REFERENCES application (id),
    template_id          BIGINT      NOT NULL REFERENCES process_template (id),
    template_version_id  BIGINT      NOT NULL REFERENCES process_template_version (id),
    version_no           INT         NOT NULL,
    snapshot             JSONB       NOT NULL,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uk_flow_instance_app UNIQUE (application_id)
);

CREATE TABLE flow_node_instance (
    id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    flow_instance_id  BIGINT       NOT NULL REFERENCES flow_instance (id),
    application_id    BIGINT       NOT NULL REFERENCES application (id),
    seq               INT          NOT NULL,
    node_key          VARCHAR(32)  NOT NULL,
    name              VARCHAR(50)  NOT NULL,
    mode              VARCHAR(16)  NOT NULL DEFAULT 'SINGLE' CHECK (mode IN ('SINGLE', 'COUNTERSIGN', 'OR_SIGN')),
    status            VARCHAR(16)  NOT NULL DEFAULT 'WAITING'
        CHECK (status IN ('WAITING', 'ACTIVE', 'APPROVED', 'REJECTED', 'CANCELED', 'SKIPPED', 'NOT_REACHED')),
    approver_rule     JSONB        NOT NULL,
    condition_expr    JSONB,
    condition_result  BOOLEAN,
    effective         BOOLEAN      NOT NULL,
    assignee_id       BIGINT REFERENCES sys_user (id),   -- 单人节点的审批人；会签 / 或签见 candidate_ids
    candidate_ids     JSONB        NOT NULL DEFAULT '[]',
    resolve_note      VARCHAR(200),
    required_count    INT          NOT NULL DEFAULT 1,
    approved_count    INT          NOT NULL DEFAULT 0,
    timeout_hours     INT,
    activated_at      TIMESTAMPTZ,
    finished_at       TIMESTAMPTZ,
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT uk_flow_node_seq UNIQUE (flow_instance_id, seq),
    CONSTRAINT ck_flow_node_effective CHECK (effective OR status IN ('SKIPPED')),
    CONSTRAINT ck_flow_node_count CHECK (approved_count >= 0 AND approved_count <= required_count)
);
-- 同一实例任一时刻至多一个 ACTIVE 节点
CREATE UNIQUE INDEX uk_flow_node_active ON flow_node_instance (flow_instance_id) WHERE status = 'ACTIVE';
CREATE INDEX idx_flow_node_app ON flow_node_instance (application_id);

CREATE TABLE approval_task (
    id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    application_id    BIGINT       NOT NULL REFERENCES application (id),
    node_instance_id  BIGINT       NOT NULL REFERENCES flow_node_instance (id),
    assignee_id       BIGINT       NOT NULL REFERENCES sys_user (id),
    status            VARCHAR(16)  NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELED', 'TRANSFERRED')),
    comment           VARCHAR(500),
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
    acted_at          TIMESTAMPTZ,
    CONSTRAINT ck_task_acted CHECK (status = 'PENDING' OR acted_at IS NOT NULL)
);
-- 每个节点同一审批人至多一个 PENDING 待办
CREATE UNIQUE INDEX uk_task_pending ON approval_task (node_instance_id, assignee_id) WHERE status = 'PENDING';
CREATE INDEX idx_task_assignee ON approval_task (assignee_id, status, created_at);
CREATE INDEX idx_task_app ON approval_task (application_id);

CREATE TABLE assignee_history (
    id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    node_instance_id  BIGINT       NOT NULL REFERENCES flow_node_instance (id),
    from_task_id      BIGINT       NOT NULL REFERENCES approval_task (id),
    to_task_id        BIGINT       NOT NULL REFERENCES approval_task (id),
    from_user_id      BIGINT       NOT NULL REFERENCES sys_user (id),
    to_user_id        BIGINT       NOT NULL REFERENCES sys_user (id),
    reason            VARCHAR(500) NOT NULL,
    operator_id       BIGINT       NOT NULL REFERENCES sys_user (id),
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX idx_assignee_history_node ON assignee_history (node_instance_id);

CREATE TABLE approval_log (
    id                   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    application_id       BIGINT       NOT NULL REFERENCES application (id),
    node_instance_id     BIGINT REFERENCES flow_node_instance (id),
    task_id              BIGINT REFERENCES approval_task (id),
    node_name            VARCHAR(50),
    operator_id          BIGINT       NOT NULL REFERENCES sys_user (id),
    operator_name        VARCHAR(50)  NOT NULL, -- 姓名快照
    action               VARCHAR(16)  NOT NULL
        CHECK (action IN ('SUBMIT', 'APPROVE', 'REJECT', 'WITHDRAW', 'TRANSFER')),
    comment              VARCHAR(500),
    from_status          VARCHAR(16),
    to_status            VARCHAR(16),
    app_version          INT          NOT NULL,
    template_version_no  INT,
    ip                   VARCHAR(64),
    created_at           TIMESTAMPTZ  NOT NULL DEFAULT now()
);
-- 同一待办的批准 / 驳回只能记一次
CREATE UNIQUE INDEX uk_approval_log_task_action ON approval_log (task_id, action) WHERE task_id IS NOT NULL;
CREATE INDEX idx_approval_log_app ON approval_log (application_id, created_at);

CREATE TABLE urge_record (
    id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    node_instance_id  BIGINT      NOT NULL REFERENCES flow_node_instance (id),
    application_id    BIGINT      NOT NULL REFERENCES application (id),
    urged_by          BIGINT      NOT NULL REFERENCES sys_user (id),
    time_bucket       BIGINT      NOT NULL, -- epoch 秒 / 14400，4 小时一档
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uk_urge_bucket UNIQUE (node_instance_id, time_bucket)
);

-- =====================================================================
-- 通知、审计、幂等、配置
-- =====================================================================

CREATE TABLE notification (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    recipient_id    BIGINT       NOT NULL REFERENCES sys_user (id),
    type            VARCHAR(32)  NOT NULL,
    title           VARCHAR(200) NOT NULL,
    content         VARCHAR(500),
    application_id  BIGINT REFERENCES application (id),
    link_path       VARCHAR(200),
    dedup_key       VARCHAR(100) NOT NULL,
    is_read         BOOLEAN      NOT NULL DEFAULT false,
    read_at         TIMESTAMPTZ,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT uk_notification_dedup UNIQUE (recipient_id, dedup_key)
);
CREATE INDEX idx_notification_recipient ON notification (recipient_id, id DESC);
CREATE INDEX idx_notification_unread ON notification (recipient_id) WHERE NOT is_read;

CREATE TABLE notification_delivery (
    id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    notification_id  BIGINT       NOT NULL REFERENCES notification (id),
    channel          VARCHAR(16)  NOT NULL DEFAULT 'EMAIL' CHECK (channel IN ('EMAIL')),
    recipient_email  VARCHAR(100) NOT NULL,
    status           VARCHAR(16)  NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SENT', 'FAILED', 'SKIPPED')),
    attempts         INT          NOT NULL DEFAULT 0,
    next_retry_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    last_error       VARCHAR(500),
    sent_at          TIMESTAMPTZ,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT uk_delivery_notification UNIQUE (notification_id, channel)
);
CREATE INDEX idx_delivery_pending ON notification_delivery (next_retry_at) WHERE status = 'PENDING';

CREATE TABLE audit_log (
    id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    operator_id    BIGINT REFERENCES sys_user (id),
    operator_name  VARCHAR(50),
    action         VARCHAR(50)  NOT NULL,
    target_type    VARCHAR(50)  NOT NULL,
    target_id      VARCHAR(64),
    before_data    JSONB,
    after_data     JSONB,
    reason         VARCHAR(500),
    ip             VARCHAR(64),
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_target ON audit_log (target_type, target_id);
CREATE INDEX idx_audit_created ON audit_log (created_at DESC);
CREATE INDEX idx_audit_operator ON audit_log (operator_id);

CREATE TABLE idempotency_record (
    id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id        BIGINT       NOT NULL REFERENCES sys_user (id),
    idem_key       VARCHAR(64)  NOT NULL,
    request_hash   CHAR(64)     NOT NULL,
    endpoint       VARCHAR(200) NOT NULL,
    status         VARCHAR(16)  NOT NULL DEFAULT 'PROCESSING' CHECK (status IN ('PROCESSING', 'COMPLETED')),
    response_code  INT,
    response_body  TEXT,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
    completed_at   TIMESTAMPTZ,
    CONSTRAINT uk_idempotency_key UNIQUE (user_id, idem_key)
);
CREATE INDEX idx_idempotency_created ON idempotency_record (created_at);

CREATE TABLE sys_config (
    config_key    VARCHAR(64) PRIMARY KEY,
    config_value  TEXT        NOT NULL,
    description   VARCHAR(200),
    updated_by    BIGINT REFERENCES sys_user (id),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
