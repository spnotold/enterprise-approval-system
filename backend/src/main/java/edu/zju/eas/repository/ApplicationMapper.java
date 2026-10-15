package edu.zju.eas.repository;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import edu.zju.eas.dto.app.ListQuery;
import edu.zju.eas.model.app.Application;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Update;
import org.apache.ibatis.annotations.Select;

import java.util.List;

/**
 * 申请主表。状态流转都写成“带条件的更新”，返回影响行数；影响 0 行说明状态或版本已被别人改过，服务层据此回滚。
 * 所有流转事务都先更新 application 行，再更新 approval_task 行，加锁顺序统一，不会互相死锁。
 */
@Mapper
public interface ApplicationMapper extends BaseMapper<Application> {

    /** 提交：草稿 → 审批中，同时固化部门、绑定模板版本、写入服务端重算的金额 */
    @Update("""
            UPDATE application
               SET status = 'IN_APPROVAL', version = version + 1,
                   dept_id = #{deptId}, template_version_id = #{templateVersionId},
                   amount_cents = #{amountCents}, current_node_seq = #{firstSeq},
                   submitted_at = now()
             WHERE id = #{id} AND applicant_id = #{uid}
               AND status = 'DRAFT' AND version = #{version} AND deleted_at IS NULL
            """)
    int submit(@Param("id") Long id, @Param("uid") Long uid, @Param("version") int version,
               @Param("deptId") Long deptId, @Param("templateVersionId") Long templateVersionId,
               @Param("amountCents") Long amountCents, @Param("firstSeq") int firstSeq);

    /** 批准：状态、版本、当前节点都对得上才推进；无后续有效节点时为已通过 */
    @Update("""
            UPDATE application
               SET version          = version + 1,
                   current_node_seq = #{nextSeq},
                   status      = CASE WHEN #{isLast} THEN 'APPROVED' ELSE 'IN_APPROVAL' END,
                   finished_at = CASE WHEN #{isLast} THEN now() END
             WHERE id = #{id}
               AND status = 'IN_APPROVAL'
               AND version = #{version}
               AND current_node_seq = #{nodeSeq}
               AND applicant_id <> #{uid}
            """)
    int advance(@Param("id") Long id, @Param("version") int version, @Param("nodeSeq") int nodeSeq,
                @Param("nextSeq") Integer nextSeq, @Param("isLast") boolean isLast, @Param("uid") Long uid);

    /** 会签 / 或签的中间批准：只锁住申请行并校验状态，不推进版本 */
    @Update("""
            UPDATE application SET updated_at = now()
             WHERE id = #{id}
               AND status = 'IN_APPROVAL'
               AND version = #{version}
               AND current_node_seq = #{nodeSeq}
               AND applicant_id <> #{uid}
            """)
    int lockForApproval(@Param("id") Long id, @Param("version") int version, @Param("nodeSeq") int nodeSeq,
                        @Param("uid") Long uid);

    /** 会签达到阈值后推进（申请行已被本事务锁住） */
    @Update("""
            UPDATE application
               SET version          = version + 1,
                   current_node_seq = #{nextSeq},
                   status      = CASE WHEN #{isLast} THEN 'APPROVED' ELSE 'IN_APPROVAL' END,
                   finished_at = CASE WHEN #{isLast} THEN now() END
             WHERE id = #{id} AND status = 'IN_APPROVAL' AND current_node_seq = #{nodeSeq}
            """)
    int advanceLocked(@Param("id") Long id, @Param("nodeSeq") int nodeSeq, @Param("nextSeq") Integer nextSeq,
                      @Param("isLast") boolean isLast);

    /** 驳回：终态，清空当前节点 */
    @Update("""
            UPDATE application
               SET status = 'REJECTED', version = version + 1, current_node_seq = NULL, finished_at = now()
             WHERE id = #{id}
               AND status = 'IN_APPROVAL'
               AND version = #{version}
               AND current_node_seq = #{nodeSeq}
               AND applicant_id <> #{uid}
            """)
    int reject(@Param("id") Long id, @Param("version") int version, @Param("nodeSeq") int nodeSeq,
               @Param("uid") Long uid);

    /** 撤回：只有申请人本人；例如审批人刚批准了最后一个节点时影响 0 行 */
    @Update("""
            UPDATE application
               SET status = 'WITHDRAWN', version = version + 1, current_node_seq = NULL, finished_at = now()
             WHERE id = #{id} AND applicant_id = #{uid}
               AND status = 'IN_APPROVAL' AND version = #{version}
            """)
    int withdraw(@Param("id") Long id, @Param("uid") Long uid, @Param("version") int version);

    /** 转办、催办前锁住审批中的申请行 */
    @Update("UPDATE application SET updated_at = now() WHERE id = #{id} AND status = 'IN_APPROVAL'")
    int lockInApproval(@Param("id") Long id);

    /** 保存草稿：版本一致才写入表头，版本 + 1 */
    @Update("""
            UPDATE application SET title = #{title}, amount_cents = #{amountCents}, version = version + 1
             WHERE id = #{id} AND applicant_id = #{uid} AND status = 'DRAFT' AND version = #{version}
               AND deleted_at IS NULL
            """)
    int saveDraftHeader(@Param("id") Long id, @Param("uid") Long uid, @Param("version") int version,
                        @Param("title") String title, @Param("amountCents") Long amountCents);

    @Update("""
            UPDATE application SET deleted_at = now(), version = version + 1
             WHERE id = #{id} AND applicant_id = #{uid} AND status = 'DRAFT' AND deleted_at IS NULL
            """)
    int softDelete(@Param("id") Long id, @Param("uid") Long uid);

    /** 列表范围在分页前进入 SQL，q 中的用户和部门范围只能由服务端构造。 */
    @Select("""
        <script>
        SELECT a.* FROM application a WHERE a.deleted_at IS NULL
        <choose>
          <when test="q.scope == 'mine'">AND a.applicant_id = #{q.userId}</when>
          <otherwise>
            AND a.status &lt;&gt; 'DRAFT'
            <if test="!q.allDepartments">
              <choose>
                <when test="q.deptIds != null and !q.deptIds.isEmpty()">
                  AND a.dept_id IN <foreach collection="q.deptIds" item="d" open="(" close=")" separator=",">#{d}</foreach>
                </when>
                <otherwise>AND FALSE</otherwise>
              </choose>
            </if>
          </otherwise>
        </choose>
        <if test="q.type != null">AND a.type = #{q.type}</if>
        <if test="q.status != null">AND a.status = #{q.status}</if>
        <if test="q.from != null">AND a.submitted_at &gt;= (CAST(#{q.from} AS date)::timestamp AT TIME ZONE 'Asia/Shanghai')</if>
        <if test="q.to != null">AND a.submitted_at &lt; ((CAST(#{q.to} AS date) + 1)::timestamp AT TIME ZONE 'Asia/Shanghai')</if>
        <if test="q.keyword != null">AND strpos(lower(a.app_no || ' ' || coalesce(a.title, '')), lower(#{q.keyword})) &gt; 0</if>
        ORDER BY a.updated_at DESC, a.id DESC
        </script>
        """)
    IPage<Application> pageList(IPage<Application> page, @Param("q") ListQuery q);
}
