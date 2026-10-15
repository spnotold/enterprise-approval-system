package edu.zju.eas.service.flow;

import edu.zju.eas.model.app.Application;
import edu.zju.eas.security.CurrentUser;

import java.util.Map;

/** 各类业务（采购 / 差旅 / 报销 / 自定义）提供给流程引擎的能力 */
public interface BizHandler {
    String type();

    /** 提交前完整校验（失败抛 422，一次返回全部问题）并在服务端重算金额，返回统计金额与条件变量 */
    SubmitData prepareSubmit(Application app, CurrentUser user);

    /** 审批路径预览用：不校验，尽量从草稿当前内容算出变量 */
    SubmitData previewVariables(Application app);

    /**
     * @param amountCents 统计金额：采购为拟选报价金额，差旅为预算，报销为明细合计，自定义为模板指定的金额字段
     * @param variables   条件变量：系统变量 amountCents / naturalDays，自定义表单字段值
     * @param labels      变量显示名，用于条件说明
     */
    record SubmitData(Long amountCents, Map<String, Object> variables, Map<String, String> labels) {
    }
}
