package edu.zju.eas.repository;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import edu.zju.eas.model.flow.ApprovalLog;
import org.apache.ibatis.annotations.Mapper;

@Mapper  // 由 @MapperScan 统一扫描
public interface ApprovalLogMapper extends BaseMapper<ApprovalLog> {
}
