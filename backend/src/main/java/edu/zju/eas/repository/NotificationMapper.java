package edu.zju.eas.repository;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import edu.zju.eas.model.common.Notification;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Options;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.util.List;

@Mapper
public interface NotificationMapper extends BaseMapper<Notification> {

    /** 去重插入：去重键由业务实体 ID 构成，请求重试、幂等重放都不会产生第二条。返回新 ID，重复时返回 null */
    @Select("""
            INSERT INTO notification (recipient_id, type, title, content, application_id, link_path, dedup_key)
            VALUES (#{n.recipientId}, #{n.type}, #{n.title}, #{n.content}, #{n.applicationId}, #{n.linkPath}, #{n.dedupKey})
            ON CONFLICT (recipient_id, dedup_key) DO NOTHING
            RETURNING id
            """)
    @Options(flushCache = Options.FlushCachePolicy.TRUE, useCache = false)
    Long insertIgnoreDuplicate(@Param("n") Notification n);

    @Select("SELECT count(*) FROM notification WHERE recipient_id = #{uid} AND NOT is_read")
    @Options(flushCache = Options.FlushCachePolicy.TRUE, useCache = false)
    long unreadCount(@Param("uid") Long uid);

    /** 标记已读：只能标记自己的通知 */
    @Update("""
            UPDATE notification SET is_read = true, read_at = now()
             WHERE id = #{id} AND recipient_id = #{uid} AND NOT is_read
            """)
    int markRead(@Param("id") Long id, @Param("uid") Long uid);

    @Update("UPDATE notification SET is_read = true, read_at = now() WHERE recipient_id = #{uid} AND NOT is_read")
    int markAllRead(@Param("uid") Long uid);

    /**
     * 增量拉取：IDENTITY 不保证提交顺序（小 ID 的事务可能晚提交），所以额外返回最近 60 秒内创建的通知，
     * 客户端按 id 去重。
     */
    @Select("""
            SELECT * FROM notification
             WHERE recipient_id = #{uid}
               AND (id > #{since} OR created_at > now() - interval '60 seconds')
             ORDER BY id LIMIT 100
            """)
    List<Notification> since(@Param("uid") Long uid, @Param("since") long since);
}
