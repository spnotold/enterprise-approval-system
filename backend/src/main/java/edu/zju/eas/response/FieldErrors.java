package edu.zju.eas.response;

import java.util.ArrayList;
import java.util.List;

/** 收集多条字段错误，一次性返回 */
public class FieldErrors {
    private final List<FieldError> list = new ArrayList<>();

    public FieldErrors add(String field, String rule, String message) {
        list.add(new FieldError(field, rule, message));
        return this;
    }

    public boolean isEmpty() {
        return list.isEmpty();
    }

    public List<FieldError> list() {
        return List.copyOf(list);
    }

    /** 有错误时抛出 422 */
    public void throwIfAny() {
        throwIfAny(ErrorCode.BIZ_RULE);
    }

    public void throwIfAny(ErrorCode code) {
        if (!list.isEmpty()) {
            String msg = list.size() == 1 ? list.get(0).message() : code.message();
            throw new BizException(code, msg, list);
        }
    }
}
