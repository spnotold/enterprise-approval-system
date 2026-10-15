package edu.zju.eas.repository;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import edu.zju.eas.model.flow.FlowNodeInstance;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Options;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.ResultMap;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.util.List;

@Mapper
public interface FlowNodeInstanceMapper extends BaseMapper<FlowNodeInstance> {

    @Update("""
            UPDATE flow_node_instance SET status = #{status}, finished_at = now()
             WHERE id = #{id} AND status = 'ACTIVE'
            """)
    int finish(@Param("id") Long id, @Param("status") String status);

    @Update("""
            UPDATE flow_node_instance SET status = 'ACTIVE', activated_at = now()
             WHERE id = #{id} AND status = 'WAITING'
            """)
    int activate(@Param("id") Long id);

    /** 驳回后，后续未到达的有效节点标记为 NOT_REACHED */
    @Update("""
            UPDATE flow_node_instance SET status = 'NOT_REACHED'
             WHERE flow_instance_id = #{fiId} AND seq > #{seq} AND status = 'WAITING'
            """)
    int markNotReached(@Param("fiId") Long fiId, @Param("seq") int seq);

    /** 撤回：进行中和等待中的节点全部取消 */
    @Update("""
            UPDATE flow_node_instance SET status = 'CANCELED', finished_at = now()
             WHERE flow_instance_id = #{fiId} AND status IN ('ACTIVE', 'WAITING')
            """)
    int cancelOpen(@Param("fiId") Long fiId);

    /** 会签计数：原子地累加，返回累加后的值；节点已不是 ACTIVE 时返回 null */
    @Select("""
            UPDATE flow_node_instance SET approved_count = approved_count + 1
             WHERE id = #{id} AND status = 'ACTIVE'
            RETURNING approved_count
            """)
    @Options(flushCache = Options.FlushCachePolicy.TRUE, useCache = false)
    Integer incrementApproved(@Param("id") Long id);

    /** 下一个有效节点（跳过 SKIPPED） */
    @Select("""
            SELECT * FROM flow_node_instance
             WHERE flow_instance_id = #{fiId} AND seq > #{seq} AND effective AND status = 'WAITING'
             ORDER BY seq LIMIT 1
            """)
    @ResultMap("mybatis-plus_FlowNodeInstance")
    FlowNodeInstance nextEffective(@Param("fiId") Long fiId, @Param("seq") int seq);

    @Select("SELECT * FROM flow_node_instance WHERE application_id = #{appId} ORDER BY seq")
    @ResultMap("mybatis-plus_FlowNodeInstance")
    List<FlowNodeInstance> listByApp(@Param("appId") Long appId);

    @Select("SELECT * FROM flow_node_instance WHERE application_id = #{appId} AND status = 'ACTIVE'")
    @ResultMap("mybatis-plus_FlowNodeInstance")
    FlowNodeInstance activeOf(@Param("appId") Long appId);
}
