package edu.zju.eas.service;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import edu.zju.eas.model.common.SysConfig;
import edu.zju.eas.repository.SysConfigMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.util.Optional;

/** 系统配置：兜底审批人、上传上限、超时时长等；短时缓存，修改时清除 */
@Service
@RequiredArgsConstructor
public class SysConfigService {
    public static final String FALLBACK_APPROVER = "flow.fallback_approver";
    public static final String MAX_FILES_PER_APP = "upload.max_files_per_app";
    public static final String MAX_TOTAL_MB_PER_APP = "upload.max_total_mb_per_app";
    public static final String TASK_OVERDUE_HOURS = "task.overdue_hours";
    public static final String MAIL_ENABLED = "mail.enabled";

    private final SysConfigMapper mapper;
    private final Cache<String, Optional<String>> cache = Caffeine.newBuilder()
            .expireAfterWrite(Duration.ofSeconds(10)).build();

    public Optional<String> get(String key) {
        return cache.get(key, k -> Optional.ofNullable(mapper.selectById(k)).map(SysConfig::getConfigValue));
    }

    public String getString(String key, String def) {
        return get(key).orElse(def);
    }

    public int getInt(String key, int def) {
        return get(key).map(v -> {
            try {
                return Integer.parseInt(v.trim());
            } catch (NumberFormatException e) {
                return def;
            }
        }).orElse(def);
    }

    public boolean getBool(String key, boolean def) {
        return get(key).map(v -> Boolean.parseBoolean(v.trim())).orElse(def);
    }

    public void evict() {
        cache.invalidateAll();
    }
}
