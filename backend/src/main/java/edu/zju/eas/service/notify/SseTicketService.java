package edu.zju.eas.service.notify;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import edu.zju.eas.security.TokenService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.Duration;

/**
 * EventSource 不能设置请求头：先用访问令牌换一个一次性票据（60 秒有效，用一次即作废，绑定用户），
 * 再用票据建立连接，访问令牌不出现在 URL 中。
 */
@Service
@RequiredArgsConstructor
public class SseTicketService {
    public static final int TTL_SECONDS = 60;

    private final TokenService tokenService;
    private final Cache<String, Long> tickets = Caffeine.newBuilder()
            .expireAfterWrite(Duration.ofSeconds(TTL_SECONDS))
            .maximumSize(50_000)
            .build();

    public String issue(Long userId) {
        String ticket = tokenService.newOpaqueToken();
        tickets.put(ticket, userId);
        return ticket;
    }

    /** 校验并作废；无效返回 null */
    public Long consume(String ticket) {
        if (ticket == null || ticket.isBlank()) {
            return null;
        }
        return tickets.asMap().remove(ticket);
    }
}
