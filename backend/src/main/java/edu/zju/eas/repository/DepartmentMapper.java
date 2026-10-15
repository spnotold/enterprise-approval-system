package edu.zju.eas.repository;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import edu.zju.eas.model.org.Department;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;

@Mapper
public interface DepartmentMapper extends BaseMapper<Department> {

    @Select("SELECT * FROM department WHERE deleted_at IS NULL ORDER BY sort_order, id")
    List<Department> listActive();

    @Select("SELECT EXISTS (SELECT 1 FROM department WHERE id = #{deptId} AND head_user_id = #{uid} AND deleted_at IS NULL)")
    boolean isHead(@Param("deptId") Long deptId, @Param("uid") Long uid);
}
