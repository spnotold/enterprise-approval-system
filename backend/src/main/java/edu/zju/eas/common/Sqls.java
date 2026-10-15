package edu.zju.eas.common;

public final class Sqls {
    private Sqls() {
    }

    /** LIKE 关键词转义：% _ \ 按字面匹配；空串返回 null 表示不过滤 */
    public static String likeKeyword(String keyword) {
        if (keyword == null || keyword.isBlank()) {
            return null;
        }
        String k = keyword.trim();
        if (k.length() > 50) {
            k = k.substring(0, 50);
        }
        return "%" + k.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%";
    }
}
