package edu.zju.eas.dto.template;

import edu.zju.eas.model.template.FormSchema;
import edu.zju.eas.model.template.NodeConfig;
import jakarta.validation.constraints.*;
import java.time.OffsetDateTime;
import java.util.List;

public final class TemplateDtos {
    private TemplateDtos() {}
    public record Create(@NotBlank @Pattern(regexp="[A-Za-z][A-Za-z0-9_]{1,49}") String code,
                         @NotBlank @Size(min=2,max=50) String name, @Size(max=500) String description,
                         @NotNull List<@NotNull Long> deptIds) {}
    public record Update(@NotBlank @Size(min=2,max=50) String name, @Size(max=500) String description,
                         @NotNull List<@NotNull Long> deptIds) {}
    public record Draft(@NotNull FormSchema formSchema, @NotNull NodeConfig nodeConfig) {}
    public record Publish(@NotBlank @Size(max=500) String changeNote) {}
    public record ValidationIssue(String code, String path, String message) {}
    public record Option(Long id, String code, String name, String description, String category, String bizType) {}
    public record Detail(Long id, String code, String name, String description, String category, String bizType,
                         Long versionId, int versionNo, FormSchema formSchema) {}
    public record VersionBrief(Long id, int versionNo, String status, String changeNote, OffsetDateTime createdAt,
                               OffsetDateTime publishedAt, String publishedByName) {}
    public record VersionDetail(Long id, int versionNo, String status, String changeNote, OffsetDateTime createdAt,
                                OffsetDateTime publishedAt, String publishedByName, FormSchema formSchema, NodeConfig nodeConfig) {}
    public record AdminItem(Long id, String code, String name, String description, String category, String bizType,
                            boolean enabled, List<Long> deptIds, List<String> deptNames, Integer currentVersionNo,
                            boolean hasDraft, long usageCount, OffsetDateTime updatedAt) {}
    public record AdminDetail(Long id, String code, String name, String description, String category, String bizType,
                              boolean enabled, List<Long> deptIds, List<String> deptNames, Integer currentVersionNo,
                              boolean hasDraft, long usageCount, OffsetDateTime updatedAt, List<VersionBrief> versions,
                              VersionDetail published, VersionDetail draft) {}
}
