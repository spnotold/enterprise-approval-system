package edu.zju.eas.service.admin;

import edu.zju.eas.common.Jsons;
import edu.zju.eas.common.Sqls;
import edu.zju.eas.common.Times;
import edu.zju.eas.dto.admin.AdminDtos.*;
import edu.zju.eas.response.BizException;
import edu.zju.eas.response.PageResponse;
import edu.zju.eas.security.Perms;
import edu.zju.eas.service.AuditService;
import edu.zju.eas.service.SysConfigService;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Service;
import edu.zju.eas.security.CurrentUser;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.LocalDate;
import java.util.*;
import static edu.zju.eas.service.admin.AdminSupport.*;

/** 管理查询只给待办元数据，不连接申请正文、明细、附件或审批意见。 */
@Service
@RequiredArgsConstructor
public class AdminQueryService {
    private final JdbcTemplate jdbc;
    private final SysConfigService config;
    private final AuditService audit;
    public PageResponse<MonitorTask> tasks(int page,int size,String assigneeStatus,String keyword) {
        require(Perms.ADMIN_TRANSFER);
        String from="""
            FROM approval_task t JOIN application a ON a.id=t.application_id
            JOIN process_template p ON p.id=a.template_id JOIN sys_user u ON u.id=t.assignee_id
            JOIN sys_user ap ON ap.id=a.applicant_id LEFT JOIN department d ON d.id=a.dept_id
            JOIN flow_node_instance n ON n.id=t.node_instance_id
            WHERE t.status='PENDING' AND n.status='ACTIVE' AND a.status='IN_APPROVAL' AND a.deleted_at IS NULL
            """;
        List<Object> args=new ArrayList<>();
        if(assigneeStatus!=null && !assigneeStatus.isBlank()){from+=" AND u.status=?";args.add(assigneeStatus);}
        String k=Sqls.likeKeyword(keyword);
        if(k!=null){from+=" AND (a.app_no ILIKE ? OR ap.real_name ILIKE ? OR u.real_name ILIKE ?)";args.addAll(List.of(k,k,k));}
        int threshold=config.getInt(SysConfigService.TASK_OVERDUE_HOURS,48);
        return page("SELECT t.id task_id,a.id application_id,a.app_no,a.type,p.name template_name,ap.real_name applicant_name,d.name dept_name,n.name node_name,u.id assignee_id,u.real_name,u.status assignee_status,t.created_at,extract(epoch FROM (now()-t.created_at))/3600 pending_hours,COALESCE(n.timeout_hours,"+threshold+") overdue_hours ",from,"t.created_at,t.id",args,
                (r,n)->new MonitorTask(r.getLong("task_id"),r.getLong("application_id"),r.getString("app_no"),r.getString("type"),r.getString("template_name"),r.getString("applicant_name"),r.getString("dept_name"),r.getString("node_name"),new TaskAssignee(r.getLong("assignee_id"),r.getString("real_name"),r.getString("assignee_status")),time(r,"created_at"),r.getDouble("pending_hours"),r.getDouble("pending_hours")>=r.getInt("overdue_hours")),page,size);
    }
    public PageResponse<AuditLogView> auditLogs(int page,int size,String action,String targetType,String targetId,Long operatorId,LocalDate from,LocalDate to) {
        require(Perms.ADMIN_AUDIT); List<Object> args=new ArrayList<>();String where=" FROM audit_log WHERE 1=1";
        if(action!=null && !action.isBlank()){where+=" AND action=?";args.add(action);}
        if(targetType!=null && !targetType.isBlank()){where+=" AND target_type=?";args.add(targetType);}
        if(targetId!=null && !targetId.isBlank()){where+=" AND target_id=?";args.add(targetId);}
        if(operatorId!=null){where+=" AND operator_id=?";args.add(operatorId);}
        if(from!=null && to!=null && from.isAfter(to)) throw BizException.rule("from","DATE_RANGE_INVALID","开始日期不得晚于结束日期");
        if(from!=null){where+=" AND created_at>=?";args.add(Times.startOfDay(from));}
        if(to!=null){where+=" AND created_at<?";args.add(Times.endExclusive(to));}
        return page("SELECT *",where,"created_at DESC,id DESC",args,(r,n)->new AuditLogView(r.getLong("id"),r.getString("operator_name"),r.getString("action"),r.getString("target_type"),r.getString("target_id"),r.getString("before_data")==null?null:Jsons.read(r.getString("before_data"),com.fasterxml.jackson.databind.JsonNode.class),r.getString("after_data")==null?null:Jsons.read(r.getString("after_data"),com.fasterxml.jackson.databind.JsonNode.class),r.getString("reason"),r.getString("ip"),time(r,"created_at")),page,size);
    }
    public PageResponse<DeliveryView> deliveries(int page,int size,String status) {
        CurrentUser u=require(Perms.ADMIN_CONFIG);String from=" FROM notification_delivery d JOIN notification n ON n.id=d.notification_id LEFT JOIN application a ON a.id=n.application_id WHERE 1=1";List<Object> args=new ArrayList<>();
        if(status!=null && !status.isBlank()){from+=" AND d.status=?";args.add(status);}
        List<Long> bizIds=new ArrayList<>();
        var result=page("SELECT d.*,n.title,a.id application_id,a.app_no,a.dept_id",from,"d.id DESC",args,(r,n)->{
            Long deptId=r.getObject("dept_id",Long.class);
            if(deptId!=null && u.covers(Perms.GRANT_BIZ_CONTENT_READ,deptId))bizIds.add(r.getLong("application_id"));
            return new DeliveryView(r.getLong("id"),r.getLong("notification_id"),r.getString("recipient_email"),deliveryTitle(u,r),r.getString("status"),r.getInt("attempts"),time(r,"next_retry_at"),r.getString("last_error"),time(r,"sent_at"),time(r,"created_at"));
        },page,size);
        if(!bizIds.isEmpty())audit.logBizList(u,"DELIVERIES",bizIds.stream().distinct().toList());
        return result;
    }

    /** 投递查询只用于运维排障；未覆盖申请部门的 BIZ_CONTENT_READ 授权时，标题脱敏为不含业务标题的通用描述。 */
    private static String deliveryTitle(CurrentUser u,ResultSet r) throws SQLException {
        Long deptId=r.getObject("dept_id",Long.class);
        return deptId==null||u.covers(Perms.GRANT_BIZ_CONTENT_READ,deptId)?r.getString("title"):"审批通知 #"+r.getString("app_no");
    }
    private <T> PageResponse<T> page(String select,String from,String order,List<Object> args,RowMapper<T> row,int page,int size) {
        page=AdminSupport.page(page);size=AdminSupport.size(size);long count=jdbc.queryForObject("SELECT count(*)"+from,Long.class,args.toArray());
        List<Object> paging=new ArrayList<>(args);paging.add(size);paging.add((long)(page-1)*size);
        return PageResponse.of(jdbc.query(select+from+" ORDER BY "+order+" LIMIT ? OFFSET ?",row,paging.toArray()),count,page,size);
    }
}
