package edu.zju.eas.repository;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;

/** 审批人解析用的只读查询 */
@Mapper
public interface FlowQueryMapper {

    /** 持有该角色且标记为主办人的用户 */
    @Select("""
            SELECT ur.user_id FROM user_role ur JOIN role r ON r.id = ur.role_id
             WHERE r.code = #{roleCode} AND ur.is_primary_handler
            """)
    Long primaryHandlerOf(@Param("roleCode") String roleCode);

    /** 持有该角色的全部启用用户（会签 / 或签） */
    @Select("""
            SELECT u.id FROM user_role ur JOIN role r ON r.id = ur.role_id JOIN sys_user u ON u.id = ur.user_id
             WHERE r.code = #{roleCode} AND u.status = 'ACTIVE'
             ORDER BY ur.is_primary_handler DESC, u.id
            """)
    List<Long> holdersOf(@Param("roleCode") String roleCode);

    @Select("SELECT head_user_id FROM department WHERE id = #{deptId} AND deleted_at IS NULL")
    Long headOf(@Param("deptId") Long deptId);

    @Select("SELECT head_user_id FROM department WHERE code = #{code} AND deleted_at IS NULL")
    Long headOfCode(@Param("code") String code);

    /** 持有 SYS_ADMIN 的账号不能做审批人，即使另有业务角色 */
    @Select("""
            SELECT EXISTS (SELECT 1 FROM user_role ur JOIN role r ON r.id = ur.role_id
                            WHERE ur.user_id = #{uid} AND r.code = 'SYS_ADMIN')
            """)
    boolean isSysAdmin(@Param("uid") Long uid);
}
