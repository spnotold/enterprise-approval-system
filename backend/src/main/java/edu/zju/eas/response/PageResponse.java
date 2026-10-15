package edu.zju.eas.response;

import com.baomidou.mybatisplus.core.metadata.IPage;

import java.util.List;
import java.util.function.Function;

/** 分页数据 {records, total, page, size}，page 从 1 开始 */
public record PageResponse<T>(List<T> records, long total, long page, long size) {

    public static <T> PageResponse<T> of(IPage<T> p) {
        return new PageResponse<>(p.getRecords(), p.getTotal(), p.getCurrent(), p.getSize());
    }

    public static <S, T> PageResponse<T> of(IPage<S> p, Function<S, T> mapper) {
        return new PageResponse<>(p.getRecords().stream().map(mapper).toList(), p.getTotal(),
                p.getCurrent(), p.getSize());
    }

    public static <T> PageResponse<T> of(List<T> records, long total, long page, long size) {
        return new PageResponse<>(records, total, page, size);
    }
}
