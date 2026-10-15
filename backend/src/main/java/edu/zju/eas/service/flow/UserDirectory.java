package edu.zju.eas.service.flow;

import edu.zju.eas.dto.common.UserBrief;
import edu.zju.eas.model.org.SysUser;
import edu.zju.eas.repository.SysUserMapper;
import edu.zju.eas.service.DepartmentService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.Collection;
import java.util.HashMap;
import java.util.Map;

/** 用户姓名、部门等显示信息 */
@Component
@RequiredArgsConstructor
public class UserDirectory {
    private final SysUserMapper userMapper;
    private final DepartmentService deptService;

    public SysUser get(Long id) {
        return id == null ? null : userMapper.selectById(id);
    }

    public String name(Long id) {
        SysUser u = get(id);
        return u == null ? null : u.getRealName();
    }

    public UserBrief brief(Long id) {
        SysUser u = get(id);
        return u == null ? null : new UserBrief(u.getId(), u.getRealName(), deptService.name(u.getDeptId()));
    }

    public Map<Long, UserBrief> briefs(Collection<Long> ids) {
        Map<Long, UserBrief> map = new HashMap<>();
        if (ids == null || ids.isEmpty()) {
            return map;
        }
        Map<Long, String> depts = deptService.names();
        for (SysUser u : userMapper.selectBatchIds(ids.stream().distinct().toList())) {
            map.put(u.getId(), new UserBrief(u.getId(), u.getRealName(), depts.get(u.getDeptId())));
        }
        return map;
    }
}
