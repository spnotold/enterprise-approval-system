package edu.zju.eas.service.notify;

import edu.zju.eas.model.app.Application;
import edu.zju.eas.model.common.Notification;
import edu.zju.eas.model.common.NotificationDelivery;
import edu.zju.eas.model.org.SysUser;
import edu.zju.eas.repository.NotificationDeliveryMapper;
import edu.zju.eas.repository.NotificationMapper;
import edu.zju.eas.repository.SysUserMapper;
import edu.zju.eas.service.SysConfigService;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.util.Map;

/**
 * 站内通知：在业务事务内写入 notification 表（服务重启后仍可查询），
 * 需要邮件的同时写一条 notification_delivery(PENDING)，由 MailDispatcher 投递；
 * 实时推送在事务提交之后进行，事务回滚就不会推送。
 */
@Service
@RequiredArgsConstructor
public class NotificationService {
    public static final String TASK_ASSIGNED = "TASK_ASSIGNED";
    public static final String NODE_APPROVED = "NODE_APPROVED";
    public static final String APP_APPROVED = "APP_APPROVED";
    public static final String APP_REJECTED = "APP_REJECTED";
    public static final String TASK_CANCELED = "TASK_CANCELED";
    public static final String TASK_TRANSFERRED = "TASK_TRANSFERRED";
    public static final String REGISTRATION_APPROVED = "REGISTRATION_APPROVED";
    public static final String URGE = "URGE";
    public static final String TASK_OVERDUE = "TASK_OVERDUE";

    private static final Map<String, String> TYPE_NAMES = Map.of(
            "PURCHASE", "采购申请", "TRAVEL", "差旅申请", "EXPENSE", "报销申请", "CUSTOM", "申请");

    private final NotificationMapper notificationMapper;
    private final NotificationDeliveryMapper deliveryMapper;
    private final SysUserMapper userMapper;
    private final SysConfigService configService;
    private final ApplicationEventPublisher events;

    /** 写一条通知；dedupKey 重复时什么都不做。返回是否新写入 */
    @Transactional(propagation = Propagation.MANDATORY)
    public boolean send(Long recipientId, String type, String title, String content, Long applicationId,
                        String linkPath, String dedupKey, boolean email) {
        Notification n = new Notification();
        n.setRecipientId(recipientId);
        n.setType(type);
        n.setTitle(truncate(title, 200));
        n.setContent(truncate(content, 500));
        n.setApplicationId(applicationId);
        n.setLinkPath(linkPath);
        n.setDedupKey(dedupKey);
        Long id = notificationMapper.insertIgnoreDuplicate(n);
        if (id == null) {
            return false;
        }
        if (email) {
            SysUser u = userMapper.selectById(recipientId);
            if (u != null && Boolean.TRUE.equals(u.getEmailNotify()) && SysUser.ACTIVE.equals(u.getStatus())
                    && configService.getBool(SysConfigService.MAIL_ENABLED, true)) {
                NotificationDelivery d = new NotificationDelivery();
                d.setNotificationId(id);
                d.setChannel("EMAIL");
                d.setRecipientEmail(u.getEmail());
                deliveryMapper.insert(d);
            }
        }
        events.publishEvent(new NotificationCreated(id, recipientId, type, n.getTitle(), linkPath, applicationId));
        return true;
    }

    // ---------------- 流程事件 ----------------

    public void taskAssigned(Application app, Long taskId, Long assigneeId, String nodeName, String applicantName) {
        send(assigneeId, TASK_ASSIGNED, "待审批：" + label(app),
                "申请人：" + applicantName + "；节点：" + nodeName, app.getId(), link(app),
                TASK_ASSIGNED + ":" + taskId, true);
    }

    public void nodeApproved(Application app, Long taskId, String nodeName, String operatorName) {
        send(app.getApplicantId(), NODE_APPROVED, "审批进度：" + label(app) + " 已通过“" + nodeName + "”",
                "操作人：" + operatorName, app.getId(), link(app), NODE_APPROVED + ":" + taskId, false);
    }

    public void appApproved(Application app, String operatorName) {
        send(app.getApplicantId(), APP_APPROVED, "已通过：" + label(app), "最后审批人：" + operatorName,
                app.getId(), link(app), APP_APPROVED + ":" + app.getId(), true);
    }

    public void appRejected(Application app, String operatorName, String nodeName, String reason) {
        send(app.getApplicantId(), APP_REJECTED, "已驳回：" + label(app),
                "驳回人：" + operatorName + "（" + nodeName + "）；理由：" + reason,
                app.getId(), link(app), APP_REJECTED + ":" + app.getId(), true);
    }

    public void taskCanceled(Application app, Long taskId, Long assigneeId, String reason) {
        send(assigneeId, TASK_CANCELED, "待办已取消：" + label(app), reason, app.getId(), link(app),
                TASK_CANCELED + ":" + taskId, true);
    }

    public void taskTransferred(Application app, Long newTaskId, Long recipientId, String content) {
        send(recipientId, TASK_TRANSFERRED, "待办转办：" + label(app), content, app.getId(), link(app),
                TASK_TRANSFERRED + ":" + newTaskId + ":" + recipientId, true);
    }

    public void registrationApproved(SysUser user, String deptName) {
        send(user.getId(), REGISTRATION_APPROVED, "注册审核已通过", "欢迎加入" + (deptName == null ? "" : deptName),
                null, "/", "REG_APPROVED:" + user.getId(), true);
    }

    public void urged(Application app, Long nodeInstanceId, long bucket, Long assigneeId, String applicantName) {
        send(assigneeId, URGE, "催办：" + label(app), applicantName + " 提醒您尽快处理", app.getId(), link(app),
                URGE + ":" + nodeInstanceId + ":" + bucket + ":" + assigneeId, true);
    }

    public void overdue(Application app, Long taskId, Long assigneeId, String day, long pendingHours) {
        send(assigneeId, TASK_OVERDUE, "超时提醒：" + label(app), "已等待 " + pendingHours + " 小时，请尽快处理",
                app.getId(), link(app), TASK_OVERDUE + ":" + taskId + ":" + day, true);
    }

    public static String typeName(String type) {
        return TYPE_NAMES.getOrDefault(type, "申请");
    }

    private static String label(Application app) {
        String title = app.getTitle() == null || app.getTitle().isBlank() ? "" : "《" + app.getTitle() + "》";
        return typeName(app.getType()) + " " + app.getAppNo() + title;
    }

    private static String link(Application app) {
        return "/applications/" + app.getId();
    }

    private static String truncate(String s, int max) {
        return s == null || s.length() <= max ? s : s.substring(0, max - 1) + "…";
    }
}
