package edu.zju.eas.dto.app;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import com.fasterxml.jackson.databind.JsonNode;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;

/** 只接收用户可编辑字段；必填与跨字段业务规则在提交时校验。 */
public final class BusinessRequests {
    private BusinessRequests() {}
    public record Purchase(Integer version, @Size(max=100) String title, @Size(max=1000) String reason,
        @Positive Long budgetLimitCents, LocalDate expectedArrivalDate, boolean singleSource,
        @Size(max=1000) String singleSourceReason, @Size(max=50) List<@Positive Long> singleSourceAttachmentIds,
        @PositiveOrZero Integer selectedQuoteIndex, @Size(max=500) String selectionReason,
        @Size(max=500) String notLowestReason, @Size(max=50) List<@NotNull @Valid PurchaseItem> items,
        @Size(max=20) List<@NotNull @Valid Quote> quotes, @Size(max=50) List<@Positive Long> attachmentIds) {}
    public record PurchaseItem(@Size(max=100) String name, @Size(max=200) String spec,
        @Size(max=20) String unit, @Pattern(regexp="^\\d{1,9}(?:\\.\\d{1,3})?$") String quantity,
        @PositiveOrZero @Max(9007199254740991L) Long unitPriceCents, @Size(max=200) String remark) {}
    public record Quote(@Size(max=100) String supplierName, @Pattern(regexp="ONLINE|OFFLINE") String channel,
        @Positive @Max(9007199254740991L) Long quoteAmountCents, @Size(max=500) String url,
        @Size(max=1000) String description, @Size(max=50) List<@Positive Long> attachmentIds) {}
    public record Travel(Integer version, @Size(max=100) String title, @Size(max=100) String origin,
        @Size(max=100) String destination, OffsetDateTime startTime, OffsetDateTime endTime,
        @Pattern(regexp="PLANE|TRAIN|BUS|CAR|OTHER") String transport, @Size(max=1000) String purpose,
        @PositiveOrZero @Max(9007199254740991L) Long budgetCents,
        @Size(max=50) List<@NotNull @Valid Companion> companions, @Size(max=50) List<@Positive Long> attachmentIds) {}
    public record Companion(@Positive Long userId, @Size(max=50) String name) {}
    public record Expense(Integer version, @Size(max=100) String title, @Size(max=1000) String description,
        @Size(max=50) List<@Positive Long> relatedApplicationIds, @Size(max=500) String independentReason,
        @Size(max=50) List<@NotNull @Valid ExpenseItem> items) {}
    public record ExpenseItem(@Size(max=32) String expenseTypeCode, LocalDate occurDate,
        @Size(max=200) String purpose, @Positive @Max(10000000L) Long amountCents,
        boolean noInvoice, @Size(max=300) String noInvoiceReason,
        @Size(max=10) List<@NotNull @Valid Invoice> invoices) {}
    public record Invoice(@NotNull @Positive Long attachmentId, @Size(max=64) String invoiceNo) {}
    public record Custom(Integer version, @Positive Long templateId, @Positive Long templateVersionId,
        @Size(max=100) String title, JsonNode formValues) {}
}
