package edu.zju.eas.service.notify;

import edu.zju.eas.config.EasProperties;
import edu.zju.eas.model.common.NotificationDelivery;
import edu.zju.eas.repository.NotificationDeliveryMapper;
import edu.zju.eas.repository.NotificationDeliveryMapper.PendingMail;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.mail.MailSendException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;

import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** 邮件失败按 1、2、4、8、16 分钟退避重试 5 次，仍失败才标记 FAILED（设计文档“邮件提醒”） */
class MailDispatcherRetryTest {

    /** 已发送 attempts 次的记录再失败一次后的更新内容 */
    private NotificationDelivery failOnce(int attempts) {
        NotificationDeliveryMapper mapper = mock(NotificationDeliveryMapper.class);
        JavaMailSender sender = mock(JavaMailSender.class);
        doThrow(new MailSendException("smtp down")).when(sender).send(any(SimpleMailMessage.class));
        when(mapper.lockPending()).thenReturn(List.of(new PendingMail(1L, 1L, "a@example.com", attempts, "标题",
                null, null, OffsetDateTime.now(), null, null, null)));
        new MailDispatcher(mapper, sender, null, new EasProperties()).dispatchBatch();
        ArgumentCaptor<NotificationDelivery> upd = ArgumentCaptor.forClass(NotificationDelivery.class);
        verify(mapper).updateById(upd.capture());
        return upd.getValue();
    }

    @Test
    void retriesFiveTimesWithDoublingBackoffThenFails() {
        long[] backoffMinutes = {1, 2, 4, 8, 16};
        for (int i = 0; i < backoffMinutes.length; i++) {
            OffsetDateTime before = OffsetDateTime.now();
            NotificationDelivery d = failOnce(i);
            assertThat(d.getAttempts()).isEqualTo(i + 1);
            assertThat(d.getStatus()).as("第 %d 次失败后仍待重试", i + 1).isNull();
            assertThat(Duration.between(before, d.getNextRetryAt()).toMinutes()).isEqualTo(backoffMinutes[i]);
        }
        NotificationDelivery last = failOnce(5);
        assertThat(last.getAttempts()).isEqualTo(6);
        assertThat(last.getStatus()).isEqualTo("FAILED");
    }
}
