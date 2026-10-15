package edu.zju.eas.repository;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import edu.zju.eas.model.org.SysUser;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Options;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.time.OffsetDateTime;

@Mapper
public interface SysUserMapper extends BaseMapper<SysUser> {

    @Select("SELECT * FROM sys_user WHERE lower(username) = lower(#{account}) OR lower(email) = lower(#{account}) LIMIT 1")
    SysUser findByAccount(@Param("account") String account);

    @Select("SELECT EXISTS (SELECT 1 FROM sys_user WHERE lower(username) = lower(#{username}))")
    boolean existsUsername(@Param("username") String username);

    @Select("SELECT EXISTS (SELECT 1 FROM sys_user WHERE lower(email) = lower(#{email}))")
    boolean existsEmail(@Param("email") String email);

    /**
     * 记录一次登录失败：15 分钟窗口内连续失败 5 次，锁定 15 分钟。返回锁定截止时间（未锁定为 null）。
     */
    @Select("""
            UPDATE sys_user u
               SET failed_login_count = s.cnt,
                   first_failed_at    = s.first_at,
                   locked_until       = CASE WHEN s.cnt >= 5 THEN now() + interval '15 minutes' ELSE u.locked_until END
              FROM (SELECT id,
                           CASE WHEN first_failed_at IS NULL OR first_failed_at < now() - interval '15 minutes'
                                THEN 1 ELSE failed_login_count + 1 END AS cnt,
                           CASE WHEN first_failed_at IS NULL OR first_failed_at < now() - interval '15 minutes'
                                THEN now() ELSE first_failed_at END AS first_at
                      FROM sys_user WHERE id = #{id}) s
             WHERE u.id = s.id
            RETURNING CASE WHEN s.cnt >= 5 THEN u.locked_until END
            """)
    @Options(flushCache = Options.FlushCachePolicy.TRUE, useCache = false)
    OffsetDateTime recordFailure(@Param("id") Long id);

    @Update("""
            UPDATE sys_user SET failed_login_count = 0, first_failed_at = NULL, locked_until = NULL,
                   last_login_at = now()
             WHERE id = #{id}
            """)
    int recordSuccess(@Param("id") Long id);

    /** 令牌失效：停用、角色变更、修改密码时调用 */
    @Update("UPDATE sys_user SET token_version = token_version + 1 WHERE id = #{id}")
    int bumpTokenVersion(@Param("id") Long id);
}
