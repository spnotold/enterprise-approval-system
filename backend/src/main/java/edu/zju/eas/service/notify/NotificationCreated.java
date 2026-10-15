package edu.zju.eas.service.notify;

/** 通知已写入（事务提交后推送） */
public record NotificationCreated(Long id, Long recipientId, String type, String title, String linkPath,
                                  Long applicationId) {
}
