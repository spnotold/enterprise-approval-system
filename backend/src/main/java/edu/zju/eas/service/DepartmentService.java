package edu.zju.eas.service;

import edu.zju.eas.dto.common.DeptOption;
import edu.zju.eas.model.org.Department;
import edu.zju.eas.repository.DepartmentMapper;
import edu.zju.eas.response.BizException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

/** 部门查询；部门的增改删与设置负责人见 admin 下的 DepartmentAdminService */
@Service
@RequiredArgsConstructor
public class DepartmentService {
    private final DepartmentMapper deptMapper;

    public Department requireEnabled(Long deptId) {
        Department d = deptId == null ? null : deptMapper.selectById(deptId);
        if (d == null || d.getDeletedAt() != null) {
            throw BizException.rule("deptId", "DEPT_INVALID", "部门不存在或已删除");
        }
        return d;
    }

    public List<DeptOption> options() {
        return deptMapper.listActive().stream().map(d -> new DeptOption(d.getId(), d.getCode(), d.getName())).toList();
    }

    /** id → 名称（含已删除部门，用于历史数据显示） */
    public Map<Long, String> names() {
        return deptMapper.selectList(null).stream()
                .collect(Collectors.toMap(Department::getId, Department::getName));
    }

    public String name(Long deptId) {
        if (deptId == null) {
            return null;
        }
        Department d = deptMapper.selectById(deptId);
        return d == null ? null : d.getName();
    }

    public Map<Long, Department> byIds(List<Long> ids) {
        if (ids.isEmpty()) {
            return Map.of();
        }
        return deptMapper.selectBatchIds(ids).stream().collect(Collectors.toMap(Department::getId, Function.identity()));
    }
}
