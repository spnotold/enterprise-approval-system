package edu.zju.eas.common.mybatis;

import com.fasterxml.jackson.databind.JsonNode;
import edu.zju.eas.common.Jsons;
import edu.zju.eas.model.template.ApproverRule;
import edu.zju.eas.model.template.Condition;
import edu.zju.eas.model.template.FormSchema;
import edu.zju.eas.model.template.NodeConfig;

import java.util.List;

/** 各 JSONB 列使用的具体类型处理器 */
public final class JsonbHandlers {
    private JsonbHandlers() {
    }

    public static class JsonNodeHandler extends JsonbTypeHandler<JsonNode> {
        public JsonNodeHandler() {
            super(Jsons.MAPPER.constructType(JsonNode.class));
        }
    }

    public static class LongListHandler extends JsonbTypeHandler<List<Long>> {
        public LongListHandler() {
            super(Jsons.MAPPER.getTypeFactory().constructCollectionType(List.class, Long.class));
        }
    }

    public static class FormSchemaHandler extends JsonbTypeHandler<FormSchema> {
        public FormSchemaHandler() {
            super(Jsons.MAPPER.constructType(FormSchema.class));
        }
    }

    public static class NodeConfigHandler extends JsonbTypeHandler<NodeConfig> {
        public NodeConfigHandler() {
            super(Jsons.MAPPER.constructType(NodeConfig.class));
        }
    }

    public static class ApproverRuleHandler extends JsonbTypeHandler<ApproverRule> {
        public ApproverRuleHandler() {
            super(Jsons.MAPPER.constructType(ApproverRule.class));
        }
    }

    public static class ConditionHandler extends JsonbTypeHandler<Condition> {
        public ConditionHandler() {
            super(Jsons.MAPPER.constructType(Condition.class));
        }
    }
}
