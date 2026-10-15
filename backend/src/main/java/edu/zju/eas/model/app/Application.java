package edu.zju.eas.model.app;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.time.OffsetDateTime;

@Data
@TableName("application")
public class Application {
    @TableId(type = IdType.AUTO)  // 主键由数据库 IDENTITY 生成
    private Long id;
    private String appNo;         // 驼峰自动映射到 app_no
    private String type;          // PURCHASE / TRAVEL / EXPENSE / CUSTOM
    private Long templateId;
    private Long templateVersionId;
    private String title;
    private Long applicantId;     // 取自当前登录用户
    private Long deptId;          // 提交时固化为申请人主属部门
    private String status;        // DRAFT / IN_APPROVAL / APPROVED ...
    private Long amountCents;     // 统计金额，单位：分
    private Integer currentNodeSeq;
    private Long sourceApplicationId; // 复制重提的来源单
    @Version                      // 乐观锁版本号，所有状态变更都带 version 条件
    private Integer version;
    private OffsetDateTime submittedAt;
    private OffsetDateTime finishedAt;
    private OffsetDateTime createdAt;
    private OffsetDateTime updatedAt;
    private OffsetDateTime deletedAt; // 仅草稿可软删除
}
