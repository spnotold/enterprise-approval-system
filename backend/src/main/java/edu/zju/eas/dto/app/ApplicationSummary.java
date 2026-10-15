package edu.zju.eas.dto.app;

import edu.zju.eas.dto.common.UserBrief;
import edu.zju.eas.dto.flow.ActionResult.CurrentNode;
import java.time.OffsetDateTime;

public record ApplicationSummary(Long id, String appNo, String type, String title, String status,
        String templateName, UserBrief applicant, String deptName, Long amountCents, CurrentNode currentNode,
        OffsetDateTime submittedAt, OffsetDateTime finishedAt, OffsetDateTime createdAt,
        OffsetDateTime updatedAt, Integer version) {}
