package edu.zju.eas.demo;

import com.fasterxml.jackson.databind.JsonNode;
import edu.zju.eas.common.Jsons;
import edu.zju.eas.dto.app.BusinessRequests.*;
import edu.zju.eas.dto.flow.ApproveRequest;
import edu.zju.eas.dto.flow.RejectRequest;
import edu.zju.eas.repository.ApprovalTaskMapper;
import edu.zju.eas.security.AuthInfoService;
import edu.zju.eas.security.CurrentUser;
import edu.zju.eas.service.app.ApplicationService;
import edu.zju.eas.service.flow.FlowEngine;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;

/**
 * demo profile：账号与模板由 db/demo/R__seed_demo.sql 写入；示例申请在这里通过真实的保存、提交、审批接口生成，
 * 快照、待办、审批日志、通知都与线上流程一致。只在演示账号存在且王工还没有任何申请时执行一次。
 */
@Slf4j
@Component
@Profile("demo")
@RequiredArgsConstructor
public class DemoDataInitializer implements ApplicationRunner {
    static final long CEO_ZHAO = 2, RD_HEAD_LI = 3, RD_EMP_WANG = 4, RD_EMP_CHEN = 5, MKT_HEAD_SUN = 6,
            MKT_EMP_ZHOU = 7, FIN_AUDITOR_WU = 9;
    static final long LEAVE_TEMPLATE = 4, LEAVE_VERSION = 4;
    private static final ZoneId CN = ZoneId.of("Asia/Shanghai");

    private final JdbcTemplate jdbc;
    private final AuthInfoService authInfo;
    private final ApplicationService applications;
    private final FlowEngine engine;
    private final ApprovalTaskMapper tasks;
    private final Clock clock;

    @Override
    public void run(ApplicationArguments args) {
        Integer demoUser = jdbc.queryForObject(
                "SELECT count(*) FROM sys_user WHERE id = ? AND username = 'rd_emp_wang'", Integer.class, RD_EMP_WANG);
        Integer existing = jdbc.queryForObject(
                "SELECT count(*) FROM application WHERE applicant_id = ?", Integer.class, RD_EMP_WANG);
        if (demoUser == null || demoUser == 0 || existing == null || existing > 0) return;
        try {
            seed();
            log.info("demo sample applications created");
        } finally {
            SecurityContextHolder.clearContext();
        }
    }

    private void seed() {
        LocalDate today = LocalDate.now(clock.withZone(CN));
        OffsetDateTime tripStart = today.minusDays(20).atTime(8, 30).atZone(CN).toOffsetDateTime();

        // 王工：已通过的差旅（供报销关联），只经过部门负责人节点
        long travel = submit("TRAVEL", RD_EMP_WANG, new Travel(null, "上海客户现场技术支持", "杭州", "上海",
                tripStart, tripStart.plusDays(2).withHour(18), "TRAIN", "为客户部署新版本并做现场培训",
                350_000L, List.of(new Companion(RD_EMP_CHEN, null)), List.of()));
        approve(travel, RD_HEAD_LI, "同意，注意控制住宿标准");

        // 王工：审批中的采购（部门负责人已批准，停在财务预算审查，待吴审处理）
        long purchase = submit("PURCHASE", RD_EMP_WANG, new Purchase(null, "研发测试服务器采购",
                "现有测试环境资源不足，需新增两台服务器用于自动化回归测试", 3_000_000L, today.plusDays(14), false,
                null, List.of(), 0, "报价最低且交付周期满足要求", null,
                List.of(new PurchaseItem("机架式服务器", "2U / 64 核 / 256GB", "台", "2", 1_250_000L, null)),
                List.of(new Quote("华东服务器有限公司", "OFFLINE", 2_500_000L, null, "线下询价，含三年上门保修", List.of()),
                        new Quote("新锐计算科技", "OFFLINE", 2_760_000L, null, "线下询价，含一年保修", List.of())),
                List.of()));
        approve(purchase, RD_HEAD_LI, "确有需要，同意");

        // 王工：已驳回的报销（部门负责人驳回）
        long expense = submit("EXPENSE", RD_EMP_WANG, new Expense(null, "团队加班餐费", null, List.of(),
                "项目上线前团队加班，无对应差旅或采购单",
                List.of(new ExpenseItem("MEAL", today.minusDays(5), "上线前加班晚餐", 68_000L, true,
                        "商家无法开具发票，附点餐记录说明", List.of()))));
        reject(expense, RD_HEAD_LI, "超出部门餐费标准，请按标准拆分后重新提交");

        // 周敏：审批中的请假（超过 3 天，会经过企业负责人；当前在部门负责人孙经理处）
        JsonNode leave = Jsons.tree(Map.of(
                "leaveType", "ANNUAL",
                "startDate", today.plusDays(7).toString(),
                "endDate", today.plusDays(11).toString(),
                "days", "5",
                "reason", "家中有事，申请年假回老家"));
        submit("CUSTOM", MKT_EMP_ZHOU, new Custom(null, LEAVE_TEMPLATE, LEAVE_VERSION, "年假申请", leave));
    }

    private long submit(String type, long applicantId, Object body) {
        CurrentUser u = as(applicantId);
        Map<String, Object> draft = applications.create(type, body, u);
        long id = ((Number) draft.get("id")).longValue();
        int version = ((Number) draft.get("version")).intValue();
        engine.submit(id, version, u);
        return id;
    }

    private void approve(long appId, long approverId, String comment) {
        CurrentUser u = as(approverId);
        var task = tasks.pendingOf(appId, approverId);
        engine.approve(task.getId(), u, new ApproveRequest(appVersion(appId), comment));
    }

    private void reject(long appId, long approverId, String comment) {
        CurrentUser u = as(approverId);
        var task = tasks.pendingOf(appId, approverId);
        engine.reject(task.getId(), u, new RejectRequest(appVersion(appId), comment));
    }

    private int appVersion(long appId) {
        return jdbc.queryForObject("SELECT version FROM application WHERE id = ?", Integer.class, appId);
    }

    /** 以指定用户身份执行：审计与权限判断读取的都是这个安全上下文 */
    private CurrentUser as(long userId) {
        CurrentUser u = authInfo.get(userId).user();
        var authorities = u.permissions().stream().map(SimpleGrantedAuthority::new).toList();
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(u, null, authorities));
        return u;
    }
}
