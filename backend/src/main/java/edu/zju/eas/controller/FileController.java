package edu.zju.eas.controller;

import edu.zju.eas.repository.AttachmentMapper;
import edu.zju.eas.response.*;
import edu.zju.eas.security.CurrentUser;
import edu.zju.eas.service.AccessPolicy;
import edu.zju.eas.service.AuditService;
import edu.zju.eas.service.file.*;
import edu.zju.eas.repository.ApplicationMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.http.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;
import java.io.IOException;
import java.nio.charset.StandardCharsets;

@RestController
@RequestMapping("/files")
@RequiredArgsConstructor
public class FileController {
    private final FileService files;
    private final AttachmentMapper attachments;
    private final ApplicationMapper applications;
    private final StorageService storage;
    private final AccessPolicy access;
    private final AuditService audit;

    @PostMapping(consumes=MediaType.MULTIPART_FORM_DATA_VALUE)
    public Object upload(@RequestParam MultipartFile file,@RequestParam String refType,@AuthenticationPrincipal CurrentUser user)throws IOException{return ApiResponse.ok(AttachmentMeta.of(files.upload(file,refType,user)));}

    @GetMapping("/{id}/content")
    public ResponseEntity<StreamingResponseBody> content(@PathVariable Long id,@RequestParam(defaultValue="false") boolean download,@AuthenticationPrincipal CurrentUser user){
        var file=attachments.selectById(id);if(!access.canReadAttachment(user,file))throw BizException.notFound();
        if(user.isAdmin()&&file.getApplicationId()!=null)audit.logBizAccess(user,applications.selectById(file.getApplicationId()),"ATTACHMENT:"+id);
        var headers=new HttpHeaders();headers.setContentType(MediaType.parseMediaType(file.getContentType()));headers.setContentLength(file.getSizeBytes());headers.setCacheControl("private, no-store");headers.set("X-Content-Type-Options","nosniff");
        headers.setContentDisposition((download?ContentDisposition.attachment():ContentDisposition.inline()).filename(file.getOriginalName(),StandardCharsets.UTF_8).build());
        if("application/pdf".equals(file.getContentType()))headers.set("Content-Security-Policy","sandbox");
        StreamingResponseBody body=out->{try(var in=storage.get(file.getStorageKey())){in.transferTo(out);}};
        return ResponseEntity.ok().headers(headers).body(body);
    }
}
