package edu.zju.eas.controller.stats;

import edu.zju.eas.dto.stats.StatsDtos.*;
import edu.zju.eas.response.ApiResponse;
import edu.zju.eas.service.stats.StatsService;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.*;
import java.time.LocalDate;

@RestController
@RequestMapping("/stats")
@RequiredArgsConstructor
public class StatsController {
    private final StatsService service;
    @GetMapping("/personal") public ApiResponse<Personal> personal(){return ApiResponse.ok(service.personal());}
    @GetMapping("/dept") public ApiResponse<Dept> dept(@RequestParam(required=false) @DateTimeFormat(iso=DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required=false) @DateTimeFormat(iso=DateTimeFormat.ISO.DATE) LocalDate to,@RequestParam(required=false) Long deptId){return ApiResponse.ok(service.department(from,to,deptId));}
    @GetMapping("/finance") public ApiResponse<Finance> finance(@RequestParam(required=false) @DateTimeFormat(iso=DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required=false) @DateTimeFormat(iso=DateTimeFormat.ISO.DATE) LocalDate to){return ApiResponse.ok(service.finance(from,to));}
    @GetMapping("/enterprise") public ApiResponse<Enterprise> enterprise(@RequestParam(required=false) @DateTimeFormat(iso=DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required=false) @DateTimeFormat(iso=DateTimeFormat.ISO.DATE) LocalDate to){return ApiResponse.ok(service.enterprise(from,to));}
}
