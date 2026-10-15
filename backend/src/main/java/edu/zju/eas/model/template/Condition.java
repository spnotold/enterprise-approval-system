package edu.zju.eas.model.template;

import lombok.Data;

import java.util.ArrayList;
import java.util.List;

/** 节点生效条件：{logic: AND|OR, rules: [{var, op, value}]} */
@Data
public class Condition {
    private String logic = "AND";
    private List<ConditionRule> rules = new ArrayList<>();
}
