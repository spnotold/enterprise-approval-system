package edu.zju.eas.dto.flow;

import edu.zju.eas.dto.common.UserBrief;

import java.util.List;

public record PathPreview(List<Node> nodes, List<String> errors) {
    public record Node(int seq, String name, String mode, boolean effective, String conditionText,
                       UserBrief assignee, List<UserBrief> candidates, String resolveNote) {
    }
}
