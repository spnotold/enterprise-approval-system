package edu.zju.eas.repository;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import edu.zju.eas.model.app.ExpenseRelation;
import org.apache.ibatis.annotations.Mapper;

@Mapper  // 由 @MapperScan 统一扫描
public interface ExpenseRelationMapper extends BaseMapper<ExpenseRelation> {
}
