package edu.zju.eas.repository;

import edu.zju.eas.dto.auth.MeView;
import edu.zju.eas.dto.common.UserOption;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;

/** 用户相关的只读查询（字典、个人信息） */
@Mapper
public interface UserQueryMapper {

    @Select("""
            SELECT u.id, u.username, u.real_name, d.name AS dept_name
              FROM sys_user u LEFT JOIN department d ON d.id = u.dept_id
             WHERE u.status = 'ACTIVE'
               AND (#{kw}::text IS NULL OR u.username ILIKE #{kw} OR u.real_name ILIKE #{kw})
             ORDER BY u.id
             LIMIT 20
            """)
    List<UserOption> searchActive(@Param("kw") String likeKeyword);

    @Select("""
            SELECT r.code, r.name, ur.is_primary_handler AS primary_handler
              FROM user_role ur JOIN role r ON r.id = ur.role_id
             WHERE ur.user_id = #{uid}
             ORDER BY r.sort_order, r.id
            """)
    List<MeView.RoleBrief> rolesOf(@Param("uid") Long uid);
}
