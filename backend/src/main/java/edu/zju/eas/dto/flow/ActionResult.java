package edu.zju.eas.dto.flow;

public record ActionResult(Long applicationId, String status, Integer appVersion, CurrentNode currentNode) {
    public record CurrentNode(Integer seq, String name, String assigneeName) {
    }
}
