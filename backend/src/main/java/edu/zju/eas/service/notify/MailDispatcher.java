package edu.zju.eas.service.notify;

import edu.zju.eas.common.Times;
import edu.zju.eas.config.EasProperties;
import edu.zju.eas.model.common.NotificationDelivery;
import edu.zju.eas.repository.NotificationDeliveryMapper;
import edu.zju.eas.repository.NotificationDeliveryMapper.PendingMail;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.OffsetDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Map;

/**
 * 邮件投递：每 10 秒取一批待发记录（FOR UPDATE SKIP LOCKED，每批 50 条）发送；
 * 失败按 1、2、4、8、16 分钟退避重试，5 次后标记失败，站内通知不受影响。
 * 邮件只包含标题、申请编号、类型、状态、操作人、时间和“在系统中查看”链接，不包含金额明细和票据。
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class MailDispatcher {
    static final int MAX_ATTEMPTS = 5;
    private static final DateTimeFormatter FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm");
    private static final Map<String, String> STATUS_NAMES = Map.of("DRAFT", "草稿", "IN_APPROVAL", "审批中",
            "APPROVED", "已通过", "REJECTED", "已驳回", "WITHDRAWN", "已撤回");

    private final NotificationDeliveryMapper deliveryMapper;
    private final JavaMailSender mailSender;
    private final TransactionTemplate tx;
    private final EasProperties props;

    @Scheduled(fixedDelay = 10_000, initialDelay = 5_000)
    public void dispatch() {
        Integer handled;
        do {
            handled = tx.execute(status -> dispatchBatch());
        } while (handled != null && handled == 50);
    }

    int dispatchBatch() {
        List<PendingMail> batch = deliveryMapper.lockPending();
        for (PendingMail m : batch) {
            NotificationDelivery upd = new NotificationDelivery();
            upd.setId(m.id());
            int attempts = m.attempts() + 1;
            upd.setAttempts(attempts);
            try {
                mailSender.send(compose(m));
                upd.setStatus("SENT");
                upd.setSentAt(OffsetDateTime.now());
                upd.setLastError(null);
            } catch (Exception e) {
                String err = e.getClass().getSimpleName() + ": " + e.getMessage();
                upd.setLastError(err.length() > 500 ? err.substring(0, 500) : err);
                if (attempts >= MAX_ATTEMPTS) {
                    upd.setStatus("FAILED");
                } else {
                    upd.setNextRetryAt(OffsetDateTime.now().plusMinutes(1L << (attempts - 1)));
                }
                log.warn("邮件投递失败（第 {} 次）delivery={} : {}", attempts, m.id(), e.getMessage());
            }
            deliveryMapper.updateById(upd);
        }
        return batch.size();
    }

    private SimpleMailMessage compose(PendingMail m) {
        SimpleMailMessage msg = new SimpleMailMessage();
        msg.setFrom(props.getApp().getMailFrom());
        msg.setTo(m.recipientEmail());
        msg.setSubject("[企业审批系统] " + m.title());
        StringBuilder body = new StringBuilder();
        body.append(m.title()).append("\n\n");
        if (m.appNo() != null) {
            body.append("申请编号：").append(m.appNo()).append('\n');
            body.append("类型：").append(NotificationService.typeName(m.appType())).append('\n');
            body.append("当前状态：").append(STATUS_NAMES.getOrDefault(m.appStatus(), m.appStatus())).append('\n');
        }
        if (m.content() != null) {
            body.append(m.content()).append('\n');
        }
        body.append("时间：").append(m.createdAt().atZoneSameInstant(Times.ZONE).format(FMT)).append("\n\n");
        if (m.linkPath() != null) {
            body.append("在系统中查看：").append(props.getApp().getBaseUrl()).append(m.linkPath()).append('\n');
        }
        body.append("\n本邮件由系统自动发送，可在“个人信息”中关闭邮件提醒。");
        msg.setText(body.toString());
        return msg;
    }
}
