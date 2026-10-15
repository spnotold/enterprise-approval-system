package edu.zju.eas.service.file;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import edu.zju.eas.model.app.Application;
import edu.zju.eas.model.common.Attachment;
import edu.zju.eas.repository.AttachmentMapper;
import edu.zju.eas.response.BizException;
import edu.zju.eas.response.ErrorCode;
import edu.zju.eas.response.FieldErrors;
import edu.zju.eas.security.CurrentUser;
import edu.zju.eas.security.RateLimiter;
import edu.zju.eas.service.SysConfigService;
import lombok.RequiredArgsConstructor;
import org.apache.tika.Tika;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.multipart.MultipartFile;

import java.io.BufferedInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.time.Clock;
import java.time.OffsetDateTime;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

/** 附件上传、类型检测、绑定、复制 */
@Service
@RequiredArgsConstructor
public class FileService {
    public static final long MAX_BYTES = 10L * 1024 * 1024;
    private static final Set<String> ALLOWED = Set.of("image/jpeg", "image/png", "application/pdf");
    private static final Set<String> REF_TYPES = Set.of("PURCHASE_ATTACHMENT", "PURCHASE_QUOTE", "SINGLE_SOURCE",
            "TRAVEL_ATTACHMENT", "EXPENSE_INVOICE", "CUSTOM_FIELD");

    private final AttachmentMapper attachmentMapper;
    private final StorageService storage;
    private final PdfInspector pdfInspector;
    private final RateLimiter rateLimiter;
    private final SysConfigService configService;
    private final Clock clock;
    private final Tika tika = new Tika();

    @Transactional
    public Attachment upload(MultipartFile file, String refType, CurrentUser u) throws IOException {
        rateLimiter.check("upload:" + u.id(), 30);   // 每用户每分钟 ≤ 30 次
        if (refType == null || !REF_TYPES.contains(refType)) {
            throw BizException.rule("refType", "FILE_REF_TYPE", "附件用途不正确");
        }
        if (file == null || file.isEmpty()) {
            throw new BizException(ErrorCode.BAD_REQUEST, "文件为空");
        }
        if (file.getSize() > MAX_BYTES) {
            throw new BizException(ErrorCode.FILE_TOO_LARGE, "文件超过 10 MB");
        }
        String detected;
        try (InputStream in = new BufferedInputStream(file.getInputStream())) {
            detected = tika.detect(in);       // 读取文件头判断真实类型，不信任扩展名和 Content-Type
        }
        String name = sanitize(file.getOriginalFilename());
        if (!ALLOWED.contains(detected) || !extensionMatches(name, detected)) {
            throw new BizException(ErrorCode.FILE_TYPE_NOT_ALLOWED, "只允许上传 JPEG、PNG、PDF 文件，且扩展名需与内容一致");
        }
        if (detected.equals("application/pdf")) {
            try (InputStream in = file.getInputStream()) {
                pdfInspector.rejectActiveContent(in); // 含 JavaScript 则拒绝
            }
        }
        String key = YearMonth.now(clock).toString().replace('-', '/') + "/" + UUID.randomUUID();
        String sha256;
        try (InputStream in = file.getInputStream()) {
            sha256 = storage.put(key, in, file.getSize(), detected);    // 边写边算哈希
        }
        removeOnRollback(key);
        Attachment a = new Attachment();
        a.setUploaderId(u.id());
        a.setRefType(refType);
        a.setOriginalName(name);
        a.setStorageKey(key);
        a.setContentType(detected);
        a.setSizeBytes(file.getSize());
        a.setSha256(sha256);
        a.setStatus(Attachment.TEMP);   // 只有上传人能访问；保存草稿时才绑定到申请
        attachmentMapper.insert(a);
        return attachmentMapper.selectById(a.getId());
    }

    /**
     * 保存草稿时绑定附件。只接受“本人上传的 TEMP 附件”或“本单已绑定的附件”，
     * 否则用户可以把别人的附件 ID 写进自己的草稿，借此读取他人文件。
     * 本单原来绑定、这次不再引用的附件退回 TEMP，24 小时后由定时任务清理。
     *
     * @param refs 附件 ID → 引用它的字段路径（用于错误定位），同一 ID 可被多处引用
     */
    @Transactional
    public Map<Long, Attachment> bind(Application app, Map<Long, String> refs, CurrentUser u) {
        Map<Long, Attachment> found = refs.isEmpty() ? Map.of() : attachmentMapper.selectBatchIds(refs.keySet())
                .stream().collect(Collectors.toMap(Attachment::getId, Function.identity()));
        FieldErrors errors = new FieldErrors();
        long totalBytes = 0;
        for (var e : refs.entrySet()) {
            Attachment a = found.get(e.getKey());
            boolean ok = a != null && (
                    (Attachment.BOUND.equals(a.getStatus()) && app.getId().equals(a.getApplicationId()))
                    || (Attachment.TEMP.equals(a.getStatus()) && u.id().equals(a.getUploaderId())));
            if (!ok) {
                errors.add(e.getValue(), "ATTACHMENT_INVALID", "附件不存在或无权使用，请重新上传");
            } else {
                totalBytes += a.getSizeBytes();
            }
        }
        errors.throwIfAny(ErrorCode.BAD_REQUEST);
        int maxFiles = configService.getInt(SysConfigService.MAX_FILES_PER_APP, 50);
        long maxBytes = configService.getInt(SysConfigService.MAX_TOTAL_MB_PER_APP, 100) * 1024L * 1024;
        if (refs.size() > maxFiles) {
            throw BizException.rule("attachments", "APP_ATTACHMENT_COUNT", "每张申请最多 " + maxFiles + " 个附件");
        }
        if (totalBytes > maxBytes) {
            throw BizException.rule("attachments", "APP_ATTACHMENT_SIZE",
                    "每张申请附件总大小不超过 " + (maxBytes / 1024 / 1024) + " MB");
        }
        OffsetDateTime now = OffsetDateTime.now(clock);
        for (Attachment a : found.values()) {
            if (Attachment.TEMP.equals(a.getStatus())) {
                int changed = attachmentMapper.update(null, Wrappers.<Attachment>lambdaUpdate()
                        .set(Attachment::getStatus, Attachment.BOUND)
                        .set(Attachment::getApplicationId, app.getId())
                        .set(Attachment::getBoundAt, now)
                        .eq(Attachment::getId, a.getId())
                        .eq(Attachment::getStatus, Attachment.TEMP)
                        .eq(Attachment::getUploaderId, u.id()));
                if (changed != 1) {
                    throw BizException.stateChanged();
                }
                a.setStatus(Attachment.BOUND);
                a.setApplicationId(app.getId());
            }
        }
        // 不再引用的附件退回 TEMP
        attachmentMapper.update(null, Wrappers.<Attachment>lambdaUpdate()
                .set(Attachment::getStatus, Attachment.TEMP)
                .set(Attachment::getApplicationId, null)
                .set(Attachment::getBoundAt, null)
                .eq(Attachment::getApplicationId, app.getId())
                .eq(Attachment::getStatus, Attachment.BOUND)
                .notIn(!refs.isEmpty(), Attachment::getId, refs.keySet()));
        return found;
    }

    /** 本单已绑定的附件 */
    public Map<Long, Attachment> boundOf(Long applicationId) {
        return attachmentMapper.selectList(Wrappers.<Attachment>lambdaQuery()
                        .eq(Attachment::getApplicationId, applicationId)
                        .eq(Attachment::getStatus, Attachment.BOUND))
                .stream().collect(Collectors.toMap(Attachment::getId, Function.identity(), (a, b) -> a,
                        LinkedHashMap::new));
    }

    /** 复制重提：把来源单的附件复制为新对象并绑定到新草稿，返回旧 ID → 新 ID */
    @Transactional
    public Map<Long, Long> copyAll(Long sourceAppId, Application target, CurrentUser u) {
        Map<Long, Long> mapping = new HashMap<>();
        OffsetDateTime now = OffsetDateTime.now(clock);
        for (Attachment src : boundOf(sourceAppId).values()) {
            String key = YearMonth.now(clock).toString().replace('-', '/') + "/" + UUID.randomUUID();
            storage.copy(src.getStorageKey(), key);
            removeOnRollback(key);
            Attachment a = new Attachment();
            a.setUploaderId(u.id());
            a.setApplicationId(target.getId());
            a.setRefType(src.getRefType());
            a.setOriginalName(src.getOriginalName());
            a.setStorageKey(key);
            a.setContentType(src.getContentType());
            a.setSizeBytes(src.getSizeBytes());
            a.setSha256(src.getSha256());
            a.setStatus(Attachment.BOUND);
            a.setBoundAt(now);
            attachmentMapper.insert(a);
            mapping.put(src.getId(), a.getId());
        }
        return mapping;
    }

    public List<AttachmentMeta> metas(Collection<Long> ids, Map<Long, Attachment> pool) {
        List<AttachmentMeta> list = new ArrayList<>();
        if (ids == null) {
            return list;
        }
        for (Long id : ids) {
            Attachment a = pool.get(id);
            if (a != null) {
                list.add(AttachmentMeta.of(a));
            }
        }
        return list;
    }

    /** MinIO 不参与数据库事务；失败回滚时清理本事务新写入的对象。 */
    private void removeOnRollback(String key) {
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override public void afterCompletion(int status) {
                if (status == STATUS_ROLLED_BACK) storage.remove(key);
            }
        });
    }

    static boolean extensionMatches(String name, String detected) {
        int dot = name.lastIndexOf('.');
        String ext = dot < 0 ? "" : name.substring(dot + 1).toLowerCase(Locale.ROOT);
        return switch (detected) {
            case "image/jpeg" -> ext.equals("jpg") || ext.equals("jpeg");
            case "image/png" -> ext.equals("png");
            case "application/pdf" -> ext.equals("pdf");
            default -> false;
        };
    }

    /** 只保留文件名部分，去掉控制字符，限制长度；存储路径与原文件名无关 */
    static String sanitize(String original) {
        String name = original == null ? "file" : original;
        name = name.replace('\\', '/');
        name = name.substring(name.lastIndexOf('/') + 1);
        name = name.replaceAll("[\\p{Cntrl}\"<>|*?:]", "_").trim();
        if (name.isEmpty()) {
            name = "file";
        }
        if (name.length() > 200) {
            int dot = name.lastIndexOf('.');
            String ext = dot > 0 && name.length() - dot <= 10 ? name.substring(dot) : "";
            name = name.substring(0, 200 - ext.length()) + ext;
        }
        return name;
    }
}
