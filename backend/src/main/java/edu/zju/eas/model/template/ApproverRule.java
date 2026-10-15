package edu.zju.eas.model.template;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@NoArgsConstructor
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
public class ApproverRule {
    public static final String SPECIFIED_USER = "SPECIFIED_USER";
    public static final String APPLICANT_DEPT_HEAD = "APPLICANT_DEPT_HEAD";
    public static final String ROLE = "ROLE";

    private String type;
    private Long userId;
    private List<Long> userIds;
    private String roleCode;

    public static ApproverRule role(String roleCode) {
        return new ApproverRule(ROLE, null, null, roleCode);
    }

    public static ApproverRule deptHead() {
        return new ApproverRule(APPLICANT_DEPT_HEAD, null, null, null);
    }
}
