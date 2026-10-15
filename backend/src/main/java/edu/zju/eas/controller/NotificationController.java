package edu.zju.eas.controller;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import edu.zju.eas.model.common.Notification;
import edu.zju.eas.repository.NotificationMapper;
import edu.zju.eas.response.ApiResponse;
import edu.zju.eas.response.BizException;
import edu.zju.eas.response.ErrorCode;
import edu.zju.eas.response.PageResponse;
import edu.zju.eas.security.CurrentUser;
import edu.zju.eas.service.notify.SseHub;
import edu.zju.eas.service.notify.SseTicketService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/notifications")
@RequiredArgsConstructor
public class NotificationController {
    private final NotificationMapper notificationMapper;
    private final SseHub sseHub;
    private final SseTicketService ticketService;

    public record NotificationItem(Long id, String type, String title, String content, Long applicationId,
                                   String linkPath, boolean read, OffsetDateTime createdAt) {
        static NotificationItem of(Notification n) {
            return new NotificationItem(n.getId(), n.getType(), n.getTitle(), n.getContent(), n.getApplicationId(),
                    n.getLinkPath(), Boolean.TRUE.equals(n.getIsRead()), n.getCreatedAt());
        }
    }

    @GetMapping
    public ApiResponse<PageResponse<NotificationItem>> list(@AuthenticationPrincipal CurrentUser user,
                                                            @RequestParam(defaultValue = "1") int page,
                                                            @RequestParam(defaultValue = "20") int size,
                                                            @RequestParam(defaultValue = "false") boolean unreadOnly) {
        var q = Wrappers.<Notification>lambdaQuery()
                .eq(Notification::getRecipientId, user.id())   // 只能读取自己的通知
                .eq(unreadOnly, Notification::getIsRead, false)
                .orderByDesc(Notification::getId);
        Page<Notification> p = notificationMapper.selectPage(Page.of(Math.max(page, 1), Math.min(Math.max(size, 1), 100)), q);
        return ApiResponse.ok(PageResponse.of(p, NotificationItem::of));
    }

    @GetMapping("/unread-count")
    public ApiResponse<Map<String, Long>> unreadCount(@AuthenticationPrincipal CurrentUser user) {
        return ApiResponse.ok(Map.of("count", notificationMapper.unreadCount(user.id())));
    }

    @PostMapping("/{id}/read")
    public ApiResponse<Void> markRead(@AuthenticationPrincipal CurrentUser user, @PathVariable Long id) {
        if (notificationMapper.markRead(id, user.id()) == 0) {
            // 影响 0 行时，再查一次是否属于本人（可能已读），否则返回 404
            Notification n = notificationMapper.selectById(id);
            if (n == null || !n.getRecipientId().equals(user.id())) {
                throw new BizException(ErrorCode.NOT_FOUND);
            }
        }
        return ApiResponse.ok();
    }

    @PostMapping("/read-all")
    public ApiResponse<Map<String, Integer>> markAllRead(@AuthenticationPrincipal CurrentUser user) {
        return ApiResponse.ok(Map.of("updated", notificationMapper.markAllRead(user.id())));
    }

    /** 增量拉取：小程序前台轮询、SSE 断线后补齐 */
    @GetMapping("/changes")
    public ApiResponse<Map<String, Object>> changes(@AuthenticationPrincipal CurrentUser user,
                                                    @RequestParam(defaultValue = "0") long since) {
        List<NotificationItem> items = notificationMapper.since(user.id(), since).stream()
                .map(NotificationItem::of).toList();
        return ApiResponse.ok(Map.of("items", items, "unreadCount", notificationMapper.unreadCount(user.id())));
    }

    /** SSE 连接：用一次性票据鉴权。票据无效时只回 401（事件流无法携带 JSON 错误体），客户端重新申请票据 */
    @GetMapping(value = "/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public ResponseEntity<SseEmitter> stream(@RequestParam String ticket) {
        Long userId = ticketService.consume(ticket);
        if (userId == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        return ResponseEntity.ok(sseHub.register(userId));
    }
}
