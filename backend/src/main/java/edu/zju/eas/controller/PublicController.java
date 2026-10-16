package edu.zju.eas.controller;

import edu.zju.eas.dto.common.DeptOption;
import edu.zju.eas.response.ApiResponse;
import edu.zju.eas.service.DepartmentService;
import lombok.RequiredArgsConstructor;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

/** 公开接口：注册页使用的部门列表、登录页判断是否展示演示账号的运行模式 */
@RestController
@RequestMapping("/public")
@RequiredArgsConstructor
public class PublicController {
    private final DepartmentService deptService;
    private final Environment env;

    @GetMapping("/departments")
    public ApiResponse<List<DeptOption>> departments() {
        return ApiResponse.ok(deptService.options());
    }

    /** demo：当前是否启用 demo profile（与演示数据的加载口径一致） */
    @GetMapping("/config")
    public ApiResponse<Map<String, Boolean>> config() {
        return ApiResponse.ok(Map.of("demo", env.acceptsProfiles(Profiles.of("demo"))));
    }
}
