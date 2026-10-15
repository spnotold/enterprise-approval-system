package edu.zju.eas.controller;

import edu.zju.eas.common.Sqls;
import edu.zju.eas.dto.common.DeptOption;
import edu.zju.eas.dto.common.ExpenseTypeOption;
import edu.zju.eas.dto.common.UserOption;
import edu.zju.eas.model.app.ExpenseType;
import edu.zju.eas.repository.ExpenseTypeMapper;
import edu.zju.eas.repository.UserQueryMapper;
import edu.zju.eas.response.ApiResponse;
import edu.zju.eas.service.DepartmentService;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/** 字典数据：部门、费用类型、用户搜索（同行人员、审批人选择） */
@RestController
@RequestMapping("/dicts")
@RequiredArgsConstructor
public class DictController {
    private final DepartmentService deptService;
    private final ExpenseTypeMapper expenseTypeMapper;
    private final UserQueryMapper userQueryMapper;

    @GetMapping("/departments")
    public ApiResponse<List<DeptOption>> departments() {
        return ApiResponse.ok(deptService.options());
    }

    @GetMapping("/expense-types")
    public ApiResponse<List<ExpenseTypeOption>> expenseTypes() {
        List<ExpenseType> list = expenseTypeMapper.selectList(Wrappers.<ExpenseType>lambdaQuery()
                .eq(ExpenseType::getEnabled, true)
                .orderByAsc(ExpenseType::getSortOrder, ExpenseType::getId));
        return ApiResponse.ok(list.stream()
                .map(t -> new ExpenseTypeOption(t.getId(), t.getCode(), t.getName(), t.getEnabled()))
                .toList());
    }

    @GetMapping("/users")
    public ApiResponse<List<UserOption>> users(@RequestParam(required = false) String keyword) {
        return ApiResponse.ok(userQueryMapper.searchActive(Sqls.likeKeyword(keyword)));
    }
}
