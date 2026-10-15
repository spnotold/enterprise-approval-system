package edu.zju.eas.common;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;

/** 统一使用上海时区计算自然日与统计日期 */
public final class Times {
    public static final ZoneId ZONE = ZoneId.of("Asia/Shanghai");

    private Times() {
    }

    /** 日期当天 00:00（上海时区） */
    public static OffsetDateTime startOfDay(LocalDate d) {
        return d == null ? null : d.atStartOfDay(ZONE).toOffsetDateTime();
    }

    /** 区间右端：to+1 天 00:00，配合 [from, to) 使用 */
    public static OffsetDateTime endExclusive(LocalDate d) {
        return d == null ? null : d.plusDays(1).atStartOfDay(ZONE).toOffsetDateTime();
    }

    public static LocalDate localDate(OffsetDateTime t) {
        return t == null ? null : t.atZoneSameInstant(ZONE).toLocalDate();
    }
}
