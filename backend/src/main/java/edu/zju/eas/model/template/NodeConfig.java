package edu.zju.eas.model.template;

import lombok.Data;

import java.util.ArrayList;
import java.util.List;

/** 审批节点定义（process_template_version.node_config），按数组顺序依次审批 */
@Data
public class NodeConfig {
    private List<NodeDef> nodes = new ArrayList<>();
}
