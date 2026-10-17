package edu.zju.eas.repository;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import edu.zju.eas.model.flow.ApprovalTask;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Options;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.util.List;

@Mapper
public interface ApprovalTaskMapper extends BaseMapper<ApprovalTask> {

    /** 完成任务：只能是本人的 PENDING 任务；影响 0 行 → 40902 */
    @Update("""
            UPDATE approval_task SET status = #{status}, comment = #{comment}, acted_at = now()
             WHERE id = #{id} AND assignee_id = #{uid} AND status = 'PENDING'
            """)
    int complete(@Param("id") Long id, @Param("uid") Long uid, @Param("status") String status,
                 @Param("comment") String comment);

    /** 撤回时取消全部待办，返回被取消的待办用于通知 */
    @Select("""
            UPDATE approval_task SET status = 'CANCELED', acted_at = now()
             WHERE application_id = #{appId} AND status = 'PENDING'
            RETURNING *
            """)
    @Options(flushCache = Options.FlushCachePolicy.TRUE, useCache = false)
    List<ApprovalTask> cancelPendingOfApp(@Param("appId") Long appId);

    /** 或签 / 驳回时取消同节点其余待办 */
    @Select("""
            UPDATE approval_task SET status = 'CANCELED', acted_at = now()
             WHERE node_instance_id = #{nodeId} AND status = 'PENDING'
            RETURNING *
            """)
    @Options(flushCache = Options.FlushCachePolicy.TRUE, useCache = false)
    List<ApprovalTask> cancelPendingOfNode(@Param("nodeId") Long nodeId);

    @Update("""
            UPDATE approval_task SET status = 'TRANSFERRED', comment = #{reason}, acted_at = now()
             WHERE id = #{id} AND status = 'PENDING'
            """)
    int markTransferred(@Param("id") Long id, @Param("reason") String reason);

    /** 当前或历史上被分配过该申请的待办 */
    @Select("SELECT EXISTS (SELECT 1 FROM approval_task WHERE application_id = #{appId} AND assignee_id = #{uid})")
    boolean existsByAppAndAssignee(@Param("appId") Long appId, @Param("uid") Long uid);

    @Select("""
            SELECT * FROM approval_task
             WHERE application_id = #{appId} AND assignee_id = #{uid} AND status = 'PENDING'
             ORDER BY id LIMIT 1
            """)
    ApprovalTask pendingOf(@Param("appId") Long appId, @Param("uid") Long uid);

    @Select("SELECT count(*) FROM approval_task WHERE application_id = #{appId} AND status = 'PENDING'")
    long countPending(@Param("appId") Long appId);

    @Select("SELECT count(*) FROM approval_task WHERE assignee_id = #{uid} AND status = 'PENDING'")
    long countPendingOfUser(@Param("uid") Long uid);

    /** 该用户是否已在此节点处理过（会签时同一人不能贡献两票） */
    @Select("SELECT EXISTS (SELECT 1 FROM approval_task WHERE node_instance_id = #{nodeId} AND assignee_id = #{uid} AND status IN ('APPROVED', 'REJECTED'))")
    boolean actedOnNode(@Param("nodeId") Long nodeId, @Param("uid") Long uid);

    /** 该用户在此节点是否还有待办（转办目标已有待办时提前拒绝） */
    @Select("SELECT EXISTS (SELECT 1 FROM approval_task WHERE node_instance_id = #{nodeId} AND assignee_id = #{uid} AND status = 'PENDING')")
    boolean pendingOnNode(@Param("nodeId") Long nodeId, @Param("uid") Long uid);
}
