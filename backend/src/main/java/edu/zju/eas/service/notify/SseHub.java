package edu.zju.eas.service.notify;

import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;

/** 每个用户的 SSE 连接；只推给接收人自己的连接 */
@Slf4j
@Component
public class SseHub {
    private static final long TIMEOUT_MS = 30 * 60 * 1000L;
    private static final int MAX_PER_USER = 5;

    private final Map<Long, List<SseEmitter>> emitters = new ConcurrentHashMap<>();

    public SseEmitter register(Long userId) {
        SseEmitter emitter = new SseEmitter(TIMEOUT_MS);
        List<SseEmitter> list = emitters.computeIfAbsent(userId, k -> new CopyOnWriteArrayList<>());
        while (list.size() >= MAX_PER_USER) {
            SseEmitter oldest = list.remove(0);
            oldest.complete();
        }
        list.add(emitter);
        Runnable remove = () -> {
            List<SseEmitter> l = emitters.get(userId);
            if (l != null) {
                l.remove(emitter);
            }
        };
        emitter.onCompletion(remove);
        emitter.onTimeout(remove);
        emitter.onError(e -> remove.run());
        try {
            emitter.send(SseEmitter.event().comment("connected"));
        } catch (IOException e) {
            remove.run();
        }
        return emitter;
    }

    public void send(Long userId, String event, Object data) {
        List<SseEmitter> list = emitters.get(userId);
        if (list == null) {
            return;
        }
        for (SseEmitter e : list) {
            try {
                e.send(SseEmitter.event().name(event).data(data));
            } catch (IOException | IllegalStateException ex) {
                list.remove(e);
            }
        }
    }

    /** 每 25 秒心跳注释行 ": ping"，防止代理断开空闲连接 */
    @Scheduled(fixedRate = 25_000)
    public void heartbeat() {
        emitters.forEach((uid, list) -> {
            for (SseEmitter e : list) {
                try {
                    e.send(SseEmitter.event().comment("ping"));
                } catch (IOException | IllegalStateException ex) {
                    list.remove(e);
                }
            }
        });
    }

    public int connectionCount() {
        return emitters.values().stream().mapToInt(List::size).sum();
    }
}
