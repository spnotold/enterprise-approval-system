package edu.zju.eas.model.org;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

@Data
@TableName("permission")
public class Permission {
    @TableId(type = IdType.AUTO)
    private Long id;
    private String code;
    private String name;
    private String category;
    private String description;
}
