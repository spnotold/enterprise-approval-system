package edu.zju.eas.service.file;

import edu.zju.eas.model.common.Attachment;

import java.time.OffsetDateTime;

public record AttachmentMeta(Long id, String originalName, String contentType, Long sizeBytes, String sha256,
                             OffsetDateTime createdAt) {
    public static AttachmentMeta of(Attachment a) {
        return new AttachmentMeta(a.getId(), a.getOriginalName(), a.getContentType(), a.getSizeBytes(), a.getSha256(),
                a.getCreatedAt());
    }
}
