package edu.zju.eas.model.template;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.time.OffsetDateTime;
import edu.zju.eas.common.mybatis.JsonbHandlers;
import edu.zju.eas.model.template.*;

@Data
@TableName(value = "process_template_version", autoResultMap = true)
public class ProcessTemplateVersion {
    public static final String DRAFT = "DRAFT";
    public static final String PUBLISHED = "PUBLISHED";
    public static final String ARCHIVED = "ARCHIVED";

    @TableId(type = IdType.AUTO)
    private Long id;
    private Long templateId;
    private Integer versionNo;
    private String status;           // DRAFT / PUBLISHED / ARCHIVED

    @TableField(typeHandler = JsonbHandlers.FormSchemaHandler.class)
    private FormSchema formSchema;   // 表单字段定义

    @TableField(typeHandler = JsonbHandlers.NodeConfigHandler.class)
    private NodeConfig nodeConfig;   // 审批节点定义

    private String changeNote;
    private Long createdBy;
    private OffsetDateTime createdAt;
    private OffsetDateTime updatedAt;
    private Long publishedBy;
    private OffsetDateTime publishedAt;
}
