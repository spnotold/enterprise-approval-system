package edu.zju.eas.repository;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import edu.zju.eas.model.flow.UrgeRecord;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Options;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

@Mapper
public interface UrgeRecordMapper extends BaseMapper<UrgeRecord> {

    /** 同一节点同一 4 小时时间档只记一次；重复时返回 null */
    @Select("""
            INSERT INTO urge_record (node_instance_id, application_id, urged_by, time_bucket)
            VALUES (#{nodeId}, #{appId}, #{uid}, #{bucket})
            ON CONFLICT (node_instance_id, time_bucket) DO NOTHING
            RETURNING id
            """)
    @Options(flushCache = Options.FlushCachePolicy.TRUE, useCache = false)
    Long insertOnce(@Param("nodeId") Long nodeId, @Param("appId") Long appId, @Param("uid") Long uid,
                    @Param("bucket") long bucket);
}
