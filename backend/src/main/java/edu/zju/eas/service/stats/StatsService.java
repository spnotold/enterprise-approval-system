package edu.zju.eas.service.stats;

import edu.zju.eas.common.Times;
import edu.zju.eas.dto.stats.StatsDtos.*;
import edu.zju.eas.response.BizException;
import edu.zju.eas.response.ErrorCode;
import edu.zju.eas.security.CurrentUser;
import edu.zju.eas.security.Perms;
import edu.zju.eas.security.SecurityUtils;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Clock;
import java.time.LocalDate;
import java.util.*;

/** 所有聚合在同一个数据库快照中执行，不按用户当前主属部门重新归属历史申请。 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
public class StatsService {
    private final JdbcTemplate jdbc;
    private final Clock clock;
    private static final String TOTALS="""
            count(*) count,
            count(*) FILTER(WHERE a.status='APPROVED') approved_count,
            count(*) FILTER(WHERE a.status='REJECTED') rejected_count,
            count(*) FILTER(WHERE a.status='IN_APPROVAL') in_approval_count,
            COALESCE(sum(a.amount_cents) FILTER(WHERE a.status='APPROVED'),0) approved_amount,
            COALESCE(sum(a.amount_cents) FILTER(WHERE a.status='IN_APPROVAL'),0) in_progress_amount,
            avg(extract(epoch FROM(a.finished_at-a.submitted_at))/3600)
                FILTER(WHERE a.status IN('APPROVED','REJECTED')) avg_hours
            """;

    public Personal personal() {
        CurrentUser u=current();
        Map<String,Long> counts=new LinkedHashMap<>();
        for(String status:List.of("DRAFT","IN_APPROVAL","APPROVED","REJECTED","WITHDRAWN")) counts.put(status,0L);
        jdbc.query("SELECT status,count(*) count FROM application WHERE applicant_id=? AND deleted_at IS NULL GROUP BY status",
                (org.springframework.jdbc.core.RowCallbackHandler)r->counts.put(r.getString("status"),r.getLong("count")),u.id());
        long pending=jdbc.queryForObject("""
                SELECT count(*) FROM approval_task t JOIN application a ON a.id=t.application_id
                JOIN flow_node_instance n ON n.id=t.node_instance_id
                WHERE t.assignee_id=? AND t.status='PENDING' AND n.status='ACTIVE'
                AND a.status='IN_APPROVAL' AND a.deleted_at IS NULL
                """,Long.class,u.id());
        long amount=jdbc.queryForObject("SELECT COALESCE(sum(amount_cents),0) FROM application WHERE applicant_id=? AND status='APPROVED' AND deleted_at IS NULL",Long.class,u.id());
        return new Personal(Collections.unmodifiableMap(counts),pending,amount,counts.get("APPROVED"));
    }

    public Dept department(LocalDate from,LocalDate to,Long deptId) {
        CurrentUser u=current();
        if(!u.has(Perms.STATS_DEPT) || u.headDeptIds().isEmpty()) throw BizException.forbidden();
        if(deptId==null) {
            if(u.headDeptIds().size()!=1) throw BizException.rule("deptId","STATS_DEPT_REQUIRED","负责多个部门时请选择统计部门");
            deptId=u.headDeptIds().iterator().next();
        }
        if(!u.isHeadOf(deptId)) throw BizException.forbidden();
        // 除缓存中的权限外，再确认负责人关系，防止组织调整后旧 principal 读取范围。
        List<String> names=jdbc.queryForList("SELECT name FROM department WHERE id=? AND head_user_id=? AND deleted_at IS NULL",String.class,deptId,u.id());
        if(names.isEmpty()) throw BizException.forbidden();
        Range range=range(from,to);List<Object> args=range.args();args.add(deptId);
        String where=base()+" AND a.dept_id=?";
        List<TypeStatus> types=jdbc.query("SELECT a.type,a.status,"+TOTALS+" FROM application a"+where+" GROUP BY a.type,a.status ORDER BY a.type,a.status",
                (r,n)->new TypeStatus(r.getString("type"),r.getString("status"),r.getLong("count"),r.getLong("approved_amount"),r.getLong("in_progress_amount")),args.toArray());
        Totals totals=jdbc.queryForObject("SELECT "+TOTALS+" FROM application a"+where,(r,n)->totals(r),args.toArray());
        List<Monthly> monthly=jdbc.query("""
                SELECT to_char(a.submitted_at AT TIME ZONE 'Asia/Shanghai','YYYY-MM') AS month,count(*) count,
                       COALESCE(sum(a.amount_cents) FILTER(WHERE a.status='APPROVED'),0) approved_amount
                FROM application a
                """+where+" GROUP BY 1 ORDER BY 1",(r,n)->new Monthly(r.getString("month"),r.getLong("count"),r.getLong("approved_amount")),args.toArray());
        return new Dept(deptId,names.get(0),range.from,range.to,types,totals,monthly);
    }

    public Finance finance(LocalDate from,LocalDate to) {
        CurrentUser u=current();
        // 授权直接读数据库并按同一次 Clock 时间判断；派生菜单权限不作为后端授权依据。
        var now=clock.instant().atOffset(java.time.ZoneOffset.UTC);
        List<Scope> scopes=jdbc.query("""
                SELECT scope_type,dept_id FROM data_scope_grant WHERE user_id=? AND permission_code='FIN_STATS_READ'
                AND revoked_at IS NULL AND valid_from<=? AND(valid_until IS NULL OR valid_until>?)
                """,(r,n)->new Scope(r.getString("scope_type"),r.getObject("dept_id",Long.class)),u.id(),now,now);
        if(scopes.isEmpty()) throw BizException.forbidden();
        Range range=range(from,to);List<Object> args=range.args();String where=base();
        if(scopes.stream().noneMatch(s->Perms.SCOPE_ALL.equals(s.type))) {
            List<Long> ids=scopes.stream().map(Scope::deptId).filter(Objects::nonNull).distinct().toList();
            if(ids.isEmpty()) throw BizException.forbidden();
            where+=" AND a.dept_id IN ("+String.join(",",Collections.nCopies(ids.size(),"?"))+")";args.addAll(ids);
        }
        String approvedExpense=where+" AND a.type='EXPENSE' AND a.status='APPROVED'";
        List<ExpenseType> byType=jdbc.query("""
                SELECT t.code,t.name,COALESCE(sum(i.amount_cents),0) amount,count(*) count
                FROM expense_item i JOIN application a ON a.id=i.application_id JOIN expense_type t ON t.id=i.expense_type_id
                """+approvedExpense+" GROUP BY t.id,t.code,t.name,t.sort_order ORDER BY t.sort_order,t.id",
                (r,n)->new ExpenseType(r.getString("code"),r.getString("name"),r.getLong("amount"),r.getLong("count")),args.toArray());
        NoInvoice noInvoice=jdbc.queryForObject("""
                SELECT count(*) FILTER(WHERE i.no_invoice) count,
                       COALESCE(sum(i.amount_cents) FILTER(WHERE i.no_invoice),0) amount,
                       COALESCE(sum(i.amount_cents),0) total
                FROM expense_item i JOIN application a ON a.id=i.application_id
                """+approvedExpense,(r,n)->new NoInvoice(r.getLong("count"),r.getLong("amount"),r.getLong("total")==0?null:r.getDouble("amount")/r.getDouble("total")),args.toArray());
        // 在申请层聚合，避免 JOIN 明细/发票把一张单金额重复计算。
        List<FinanceDept> byDept=jdbc.query("""
                SELECT a.dept_id,d.name,
                       COALESCE(sum(a.amount_cents) FILTER(WHERE a.type='EXPENSE'),0) expense_amount,
                       COALESCE(sum(a.amount_cents) FILTER(WHERE a.type='PURCHASE'),0) purchase_amount
                FROM application a JOIN department d ON d.id=a.dept_id
                """+where+" AND a.status='APPROVED' AND a.type IN('EXPENSE','PURCHASE') GROUP BY a.dept_id,d.name,d.sort_order ORDER BY d.sort_order,a.dept_id",
                (r,n)->new FinanceDept(r.getLong("dept_id"),r.getString("name"),r.getLong("expense_amount"),r.getLong("purchase_amount")),args.toArray());
        return new Finance(range.from,range.to,byType,noInvoice,byDept);
    }

    public Enterprise enterprise(LocalDate from,LocalDate to) {
        CurrentUser u=current();var now=clock.instant().atOffset(java.time.ZoneOffset.UTC);
        Boolean allowed=jdbc.queryForObject("""
                SELECT EXISTS(SELECT 1 FROM data_scope_grant WHERE user_id=? AND permission_code='APP_READ' AND scope_type='ALL'
                AND revoked_at IS NULL AND valid_from<=? AND(valid_until IS NULL OR valid_until>?))
                """,Boolean.class,u.id(),now,now);
        if(!Boolean.TRUE.equals(allowed)) throw BizException.forbidden();
        Range range=range(from,to);
        List<EnterpriseDept> rows=jdbc.query("SELECT a.dept_id,d.name,"+TOTALS+" FROM application a JOIN department d ON d.id=a.dept_id"+base()+" GROUP BY a.dept_id,d.name,d.sort_order ORDER BY d.sort_order,a.dept_id",
                (r,n)->{Totals t=totals(r);return new EnterpriseDept(r.getLong("dept_id"),r.getString("name"),t.count(),t.approvedCount(),t.rejectedCount(),t.inApprovalCount(),t.approvedAmountCents(),t.inProgressAmountCents(),t.approvalRate(),t.avgApprovalHours());},range.args().toArray());
        return new Enterprise(range.from,range.to,rows);
    }

    private static String base() {return " WHERE a.status<>'DRAFT' AND a.deleted_at IS NULL AND a.submitted_at>=? AND a.submitted_at<?";}
    private static Totals totals(ResultSet r) throws SQLException {
        long approved=r.getLong("approved_count"),rejected=r.getLong("rejected_count");
        var average=r.getBigDecimal("avg_hours");
        return new Totals(r.getLong("count"),approved,rejected,r.getLong("in_approval_count"),r.getLong("approved_amount"),
                r.getLong("in_progress_amount"),approved+rejected==0?null:(double)approved/(approved+rejected),average==null?null:average.doubleValue());
    }
    private CurrentUser current() {
        CurrentUser u=SecurityUtils.currentOrNull();if(u==null) throw new BizException(ErrorCode.UNAUTHORIZED);return u;
    }
    private Range range(LocalDate from,LocalDate to) {
        LocalDate today=LocalDate.now(clock.withZone(Times.ZONE));
        if(to==null) to=today;
        if(from==null) from=to.withDayOfYear(1);
        if(from.isAfter(to) || from.getYear()<1 || to.getYear()>9998) throw BizException.rule("from","DATE_RANGE_INVALID","统计日期范围不合法");
        return new Range(from,to);
    }
    private record Range(LocalDate from,LocalDate to) {
        List<Object> args(){return new ArrayList<>(List.of(Times.startOfDay(from),Times.endExclusive(to)));}
    }
    private record Scope(String type,Long deptId) {}
}
