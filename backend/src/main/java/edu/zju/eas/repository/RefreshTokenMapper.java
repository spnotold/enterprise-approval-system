package edu.zju.eas.repository;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import edu.zju.eas.model.org.RefreshToken;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.util.UUID;

@Mapper
public interface RefreshTokenMapper extends BaseMapper<RefreshToken> {

    @Select("SELECT * FROM refresh_token WHERE token_hash = #{hash}")
    RefreshToken findByHash(@Param("hash") String hash);

    /** 标记为已轮换；并发刷新时只有一个能成功 */
    @Update("UPDATE refresh_token SET rotated_at = now() WHERE id = #{id} AND rotated_at IS NULL AND revoked_at IS NULL")
    int markRotated(@Param("id") Long id);

    @Update("UPDATE refresh_token SET revoked_at = now() WHERE family_id = #{familyId} AND revoked_at IS NULL")
    int revokeFamily(@Param("familyId") UUID familyId);

    @Update("UPDATE refresh_token SET revoked_at = now() WHERE user_id = #{userId} AND revoked_at IS NULL")
    int revokeAllOfUser(@Param("userId") Long userId);

    @Update("DELETE FROM refresh_token WHERE expires_at < now() - interval '7 days'")
    int deleteExpired();
}
