package edu.zju.eas.dto.stats;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

public final class StatsDtos {
    private StatsDtos() {}
    public record Personal(Map<String,Long> statusCounts,long pendingTaskCount,long approvedAmountCents,long approvedCount) {}
    public record TypeStatus(String type,String status,long count,long approvedAmountCents,long inProgressAmountCents) {}
    public record Totals(long count,long approvedCount,long rejectedCount,long inApprovalCount,long approvedAmountCents,
                         long inProgressAmountCents,Double approvalRate,Double avgApprovalHours) {}
    public record Monthly(String month,long count,long approvedAmountCents) {}
    public record Dept(Long deptId,String deptName,LocalDate from,LocalDate to,List<TypeStatus> byTypeStatus,Totals totals,List<Monthly> monthly) {}
    public record ExpenseType(String code,String name,long approvedAmountCents,long itemCount) {}
    /** 无票占比按金额计算，分母为相同范围内已通过报销的明细金额。 */
    public record NoInvoice(long count,long amountCents,Double ratio) {}
    public record FinanceDept(Long deptId,String deptName,long expenseAmountCents,long purchaseAmountCents) {}
    public record Finance(LocalDate from,LocalDate to,List<ExpenseType> byExpenseType,NoInvoice noInvoice,List<FinanceDept> byDept) {}
    public record EnterpriseDept(Long deptId,String deptName,long count,long approvedCount,long rejectedCount,long inApprovalCount,
                                 long approvedAmountCents,long inProgressAmountCents,Double approvalRate,Double avgApprovalHours) {}
    public record Enterprise(LocalDate from,LocalDate to,List<EnterpriseDept> byDept) {}
}
