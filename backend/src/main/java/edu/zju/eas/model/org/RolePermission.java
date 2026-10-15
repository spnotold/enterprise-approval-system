package edu.zju.eas.model.org;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

@Data
@TableName("role_permission")
public class RolePermission {
    private Long roleId;
    private Long permissionId;
}
