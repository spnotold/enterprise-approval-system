package edu.zju.eas.repository;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import edu.zju.eas.model.template.ProcessTemplateDept;
import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;

@Mapper
public interface ProcessTemplateDeptMapper extends BaseMapper<ProcessTemplateDept> {

    @Select("SELECT dept_id FROM process_template_dept WHERE template_id = #{templateId} ORDER BY dept_id")
    List<Long> deptIdsOf(@Param("templateId") Long templateId);

    @Delete("DELETE FROM process_template_dept WHERE template_id = #{templateId}")
    int deleteByTemplate(@Param("templateId") Long templateId);

    /** 适用部门为空表示全部部门 */
    @Select("""
            SELECT NOT EXISTS (SELECT 1 FROM process_template_dept WHERE template_id = #{templateId})
                OR EXISTS (SELECT 1 FROM process_template_dept WHERE template_id = #{templateId} AND dept_id = #{deptId})
            """)
    boolean appliesTo(@Param("templateId") Long templateId, @Param("deptId") Long deptId);
}
