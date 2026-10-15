package edu.zju.eas.controller.template;

import edu.zju.eas.dto.template.TemplateDtos.*;
import edu.zju.eas.response.ApiResponse;
import edu.zju.eas.service.template.TemplateService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@RequestMapping("/templates")
@RequiredArgsConstructor
public class TemplateController {
    private final TemplateService service;
    @GetMapping("/available") public ApiResponse<List<Option>> available(){return ApiResponse.ok(service.available());}
    @GetMapping("/{id}/current") public ApiResponse<Detail> current(@PathVariable Long id){return ApiResponse.ok(service.current(id));}
}
