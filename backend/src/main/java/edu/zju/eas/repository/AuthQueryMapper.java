package edu.zju.eas.repository;

import edu.zju.eas.model.org.DataScopeGrant;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;

/** 加载当前用户权限信息用的只读查询 */
@Mapper
public interface AuthQueryMapper {

    @Select("""
            SELECT r.code FROM user_role ur JOIN role r ON r.id = ur.role_id
             WHERE ur.user_id = #{uid}
            """)
    List<String> roleCodes(@Param("uid") Long uid);

    @Select("""
            SELECT DISTINCT p.code
              FROM user_role ur
              JOIN role_permission rp ON rp.role_id = ur.role_id
              JOIN permission p ON p.id = rp.permission_id
             WHERE ur.user_id = #{uid}
            """)
    List<String> permissionCodes(@Param("uid") Long uid);

    @Select("SELECT id FROM department WHERE head_user_id = #{uid} AND deleted_at IS NULL")
    List<Long> headDeptIds(@Param("uid") Long uid);

    /** 未回收且未过期的授权（含尚未生效的，使用时再判断） */
    @Select("""
            SELECT * FROM data_scope_grant
             WHERE user_id = #{uid} AND revoked_at IS NULL
               AND (valid_until IS NULL OR valid_until > now())
            """)
    List<DataScopeGrant> unrevokedGrants(@Param("uid") Long uid);
}
