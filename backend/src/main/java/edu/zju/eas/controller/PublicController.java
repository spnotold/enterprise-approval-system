package edu.zju.eas.controller;

import edu.zju.eas.dto.common.DeptOption;
import edu.zju.eas.response.ApiResponse;
import edu.zju.eas.service.DepartmentService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/** 公开接口：注册页使用的部门列表 */
@RestController
@RequestMapping("/public")
@RequiredArgsConstructor
public class PublicController {
    private final DepartmentService deptService;

    @GetMapping("/departments")
    public ApiResponse<List<DeptOption>> departments() {
        return ApiResponse.ok(deptService.options());
    }
}
