package edu.zju.eas.common;

import java.util.ArrayList;
import java.util.List;

/** 被 @Audited 标注的方法在执行过程中登记审计内容（线程内） */
public final class AuditTrail {
    public record Entry(String targetId, Object before, Object after, String reason) {
    }

    private static final ThreadLocal<List<Entry>> ENTRIES = new ThreadLocal<>();

    private AuditTrail() {
    }

    static void begin() {
        ENTRIES.set(new ArrayList<>());
    }

    static List<Entry> end() {
        List<Entry> list = ENTRIES.get();
        ENTRIES.remove();
        return list == null ? List.of() : list;
    }

    /** 一次操作可以登记多条（如批量变更），未登记时切面只记动作本身 */
    public static void record(Object targetId, Object before, Object after, String reason) {
        List<Entry> list = ENTRIES.get();
        if (list != null) {
            list.add(new Entry(targetId == null ? null : String.valueOf(targetId), before, after, reason));
        }
    }
}
