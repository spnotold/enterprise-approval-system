package edu.zju.eas.service;

import edu.zju.eas.dto.auth.MeView;
import edu.zju.eas.model.org.SysUser;
import edu.zju.eas.repository.SysUserMapper;
import edu.zju.eas.repository.UserQueryMapper;
import edu.zju.eas.response.BizException;
import edu.zju.eas.security.AuthInfoService;
import edu.zju.eas.security.CurrentUser;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class MeService {
    private final SysUserMapper userMapper;
    private final UserQueryMapper userQueryMapper;
    private final DepartmentService deptService;
    private final AuthInfoService authInfoService;

    public MeView me(CurrentUser cu) {
        SysUser u = userMapper.selectById(cu.id());
        if (u == null) {
            throw BizException.notFound();
        }
        Map<Long, String> deptNames = deptService.names();
        Instant now = Instant.now();
        var grants = cu.grants().stream()
                .filter(g -> g.activeAt(now))
                .map(g -> new MeView.GrantBrief(g.permissionCode(), g.scopeType(), g.deptId(),
                        g.deptId() == null ? null : deptNames.get(g.deptId()), g.validUntil()))
                .toList();
        return new MeView(u.getId(), u.getUsername(), u.getRealName(), u.getEmail(), u.getDeptId(),
                deptNames.get(u.getDeptId()), userQueryMapper.rolesOf(u.getId()), cu.permissions(),
                cu.headDeptIds(), grants, Boolean.TRUE.equals(u.getEmailNotify()));
    }

    @Transactional
    public void updatePreferences(Long userId, boolean emailNotify) {
        SysUser upd = new SysUser();
        upd.setId(userId);
        upd.setEmailNotify(emailNotify);
        userMapper.updateById(upd);
        authInfoService.evict(userId);
    }
}
