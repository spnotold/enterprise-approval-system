package edu.zju.eas.security;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import edu.zju.eas.response.BizException;
import edu.zju.eas.response.ErrorCode;
import io.github.bucket4j.Bandwidth;
import io.github.bucket4j.Bucket;
import org.springframework.stereotype.Component;

import java.time.Duration;

/** 基于 Bucket4j 的进程内限流：登录（按 IP、按账号）、上传（按用户） */
@Component
public class RateLimiter {
    private final Cache<String, Bucket> buckets = Caffeine.newBuilder()
            .expireAfterAccess(Duration.ofMinutes(10))
            .maximumSize(100_000)
            .build();

    /** 每分钟最多 perMinute 次，超出返回 429 */
    public void check(String key, int perMinute) {
        Bucket bucket = buckets.get(key + "#" + perMinute, k -> Bucket.builder()
                .addLimit(Bandwidth.builder().capacity(perMinute)
                        .refillGreedy(perMinute, Duration.ofMinutes(1)).build())
                .build());
        if (!bucket.tryConsume(1)) {
            throw new BizException(ErrorCode.RATE_LIMITED);
        }
    }

    /** 测试中重置 */
    public void reset() {
        buckets.invalidateAll();
    }
}
