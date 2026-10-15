package edu.zju.eas.job;

import edu.zju.eas.IntegrationTestBase;
import edu.zju.eas.dto.flow.ApproveRequest;
import edu.zju.eas.service.flow.FlowEngine;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.concurrent.*;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class MaintenanceJobsTest extends IntegrationTestBase {
    @Autowired CleanupJobs cleanup;
    @Autowired OverdueReminderJob reminders;
    @Autowired TransactionTemplate tx;
    @Autowired FlowEngine flow;

    @Test void returnedTempAttachmentKeepsItsFullRetentionWindow() {
        long owner=uid("rd_emp_wang");
        long old=attachment(owner,"old-temp","now() - interval '3 days'");
        long returned=attachment(owner,"recently-unbound","now()");
        assertEquals(1,cleanup.purgeTempAttachments());
        assertEquals("DELETED",jdbc.queryForObject("SELECT status FROM attachment WHERE id=?",String.class,old));
        assertEquals("TEMP",jdbc.queryForObject("SELECT status FROM attachment WHERE id=?",String.class,returned));
        verify(storage).remove("old-temp");verify(storage,never()).remove("recently-unbound");
    }

    @Test void overdueReminderIsDeduplicatedPerTaskAndDay() throws Exception {
        long app=submitted("travel","rd_emp_wang",travelBody(10000));long task=pendingTask(app,"rd_head_li");
        jdbc.update("UPDATE approval_task SET created_at=now()-interval '3 days' WHERE id=?",task);
        assertEquals(1,reminders.remind());assertEquals(0,reminders.remind());
        assertEquals(1,jdbc.queryForObject("SELECT count(*) FROM notification WHERE application_id=? AND type='TASK_OVERDUE'",Integer.class,app));
    }

    @Test void completedTaskIsNotRemindedFromAStaleScan() throws Exception {
        long app=submitted("travel","rd_emp_wang",travelBody(10000));long task=pendingTask(app,"rd_head_li");
        jdbc.update("UPDATE approval_task SET created_at=now()-interval '3 days' WHERE id=?",task);
        ExecutorService worker=Executors.newSingleThreadExecutor();
        try {
            Future<Integer> result=tx.execute(status->{
                int owner=jdbc.queryForObject("SELECT pg_backend_pid()",Integer.class);
                jdbc.queryForObject("SELECT id FROM application WHERE id=? FOR UPDATE",Long.class,app);
                Future<Integer> pending=worker.submit(reminders::remind);
                long until=System.nanoTime()+TimeUnit.SECONDS.toNanos(5);
                boolean scannedAndWaiting=false;
                // 确保提醒扫描发生在审批提交前；旧实现会直接完成并发送错误提醒。
                while(!pending.isDone() && System.nanoTime()<until){
                    Boolean waiting=jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE ?=ANY(pg_blocking_pids(pid)))",Boolean.class,owner);
                    if(Boolean.TRUE.equals(waiting)){scannedAndWaiting=true;break;}
                    try {Thread.sleep(10);}catch(InterruptedException e){Thread.currentThread().interrupt();throw new IllegalStateException(e);}
                }
                assertTrue(scannedAndWaiting,"提醒线程必须先完成扫描并等待申请行锁，才能验证过期扫描竞态");
                flow.approve(task,authInfo.get(uid("rd_head_li")).user(),new ApproveRequest(version(app),"同意"));
                return pending;
            });
            assertNotNull(result);assertEquals(0,result.get(10,TimeUnit.SECONDS));
            assertEquals("APPROVED",status(app));
            assertEquals(0,jdbc.queryForObject("SELECT count(*) FROM notification WHERE application_id=? AND type='TASK_OVERDUE'",Integer.class,app));
        } finally {worker.shutdownNow();}
    }

    private long attachment(long owner,String key,String updatedAt) {
        return jdbc.queryForObject("""
                INSERT INTO attachment(uploader_id,ref_type,original_name,storage_key,content_type,size_bytes,
                    sha256,status,created_at,updated_at)
                VALUES (?,'TRAVEL_ATTACHMENT','test.png',?,'image/png',100,?,'TEMP',now()-interval '3 days',
                """+updatedAt+") RETURNING id",Long.class,owner,key,"a".repeat(64));
    }
}
