package edu.zju.eas.service.file;

import edu.zju.eas.common.Hashes;
import edu.zju.eas.config.EasProperties;
import io.minio.CopyObjectArgs;
import io.minio.CopySource;
import io.minio.GetObjectArgs;
import io.minio.MinioClient;
import io.minio.PutObjectArgs;
import io.minio.RemoveObjectArgs;
import io.minio.errors.ErrorResponseException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.io.InputStream;
import java.security.DigestInputStream;
import java.security.MessageDigest;

/** MinIO 私有桶 eas-files；浏览器拿不到直链，下载由后端鉴权后转发 */
@Service
@RequiredArgsConstructor
public class StorageService {
    private final MinioClient minio;
    private final EasProperties props;

    private String bucket() {
        return props.getMinio().getBucket();
    }

    /** 写入对象，边写边算 SHA-256 */
    public String put(String key, InputStream in, long size, String contentType) {
        MessageDigest md = Hashes.sha256();
        try (DigestInputStream din = new DigestInputStream(in, md)) {
            minio.putObject(PutObjectArgs.builder().bucket(bucket()).object(key)
                    .stream(din, size, -1).contentType(contentType).build());
        } catch (Exception e) {
            throw new StorageException("写入文件存储失败", e);
        }
        return Hashes.hex(md.digest());
    }

    public InputStream get(String key) {
        try {
            return minio.getObject(GetObjectArgs.builder().bucket(bucket()).object(key).build());
        } catch (Exception e) {
            throw new StorageException("读取文件存储失败", e);
        }
    }

    public void copy(String sourceKey, String targetKey) {
        try {
            minio.copyObject(CopyObjectArgs.builder().bucket(bucket()).object(targetKey)
                    .source(CopySource.builder().bucket(bucket()).object(sourceKey).build()).build());
        } catch (Exception e) {
            throw new StorageException("复制文件失败", e);
        }
    }

    /** 删除对象；对象已不存在时忽略 */
    public void remove(String key) {
        try {
            minio.removeObject(RemoveObjectArgs.builder().bucket(bucket()).object(key).build());
        } catch (ErrorResponseException e) {
            if (!"NoSuchKey".equals(e.errorResponse().code())) {
                throw new StorageException("删除文件失败", e);
            }
        } catch (Exception e) {
            throw new StorageException("删除文件失败", e);
        }
    }

    public static class StorageException extends RuntimeException {
        public StorageException(String message, Throwable cause) {
            super(message, cause);
        }
    }
}
