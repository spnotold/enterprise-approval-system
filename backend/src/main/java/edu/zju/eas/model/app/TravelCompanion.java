package edu.zju.eas.model.app;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

@Data
@TableName("travel_companion")
public class TravelCompanion {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long applicationId;
    private Integer seq;
    private Long userId;
    private String name;
}
