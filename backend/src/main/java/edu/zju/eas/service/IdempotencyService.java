package edu.zju.eas.service;

import com.fasterxml.jackson.databind.JsonNode;
import edu.zju.eas.common.Jsons;
import edu.zju.eas.response.*;
import edu.zju.eas.security.CurrentUser;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.function.Supplier;

/** 请求登记、业务流转和响应快照在同一事务提交；失败时全部回滚。 */
@Service
@RequiredArgsConstructor
public class IdempotencyService {
    private final JdbcTemplate jdbc;

    @Transactional
    public JsonNode execute(CurrentUser user, String key, String endpoint, Object body, Supplier<?> action) {
        if (key == null || key.isBlank()) throw new BizException(ErrorCode.MISSING_HEADER, "缺少 Idempotency-Key");
        if (!key.matches("[A-Za-z0-9_-]{8,64}")) throw new BizException(ErrorCode.BAD_REQUEST, "Idempotency-Key 格式不正确");
        String fingerprint = hash(endpoint + "\n" + Jsons.write(body));
        // 非阻塞的事务锁避免相同请求在唯一索引上长时间等待；事务结束自动释放。
        Boolean locked = jdbc.queryForObject("SELECT pg_try_advisory_xact_lock(hashtextextended(?, 0))",
            Boolean.class, "idem:" + user.id() + ":" + key);
        if (!Boolean.TRUE.equals(locked)) throw new BizException(ErrorCode.REQUEST_IN_PROGRESS);
        var old = jdbc.queryForList("SELECT request_hash, status, response_body FROM idempotency_record WHERE user_id = ? AND idem_key = ?",
            user.id(), key);
        if (!old.isEmpty()) {
            var row = old.get(0);
            if (!fingerprint.equals(row.get("request_hash"))) throw new BizException(ErrorCode.IDEMPOTENCY_KEY_REUSED);
            if (!"COMPLETED".equals(row.get("status"))) throw new BizException(ErrorCode.REQUEST_IN_PROGRESS);
            return Jsons.read((String)row.get("response_body"), JsonNode.class);
        }
        jdbc.update("INSERT INTO idempotency_record(user_id, idem_key, request_hash, endpoint) VALUES (?, ?, ?, ?)",
            user.id(), key, fingerprint, endpoint);
        JsonNode response = Jsons.tree(ApiResponse.ok(action.get()));
        jdbc.update("UPDATE idempotency_record SET status='COMPLETED', response_code=200, response_body=?, completed_at=now() WHERE user_id=? AND idem_key=?",
            Jsons.write(response), user.id(), key);
        return response;
    }

    private static String hash(String value) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8))); }
        catch (NoSuchAlgorithmException e) { throw new IllegalStateException(e); }
    }
}
