package edu.zju.eas.service.file;

import edu.zju.eas.response.BizException;
import edu.zju.eas.response.ErrorCode;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.cos.COSArray;
import org.apache.pdfbox.cos.COSBase;
import org.apache.pdfbox.cos.COSDictionary;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.cos.COSObject;
import org.apache.pdfbox.io.RandomAccessReadBuffer;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.encryption.InvalidPasswordException;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.io.InputStream;

/** PDF 主动内容检查：含 JavaScript、自动执行动作、启动外部程序或嵌入文件时拒绝 */
@Component
public class PdfInspector {
    private static final COSName JS = COSName.getPDFName("JS");
    private static final COSName JAVASCRIPT = COSName.getPDFName("JavaScript");
    private static final COSName LAUNCH = COSName.getPDFName("Launch");
    private static final COSName EMBEDDED_FILES = COSName.getPDFName("EmbeddedFiles");
    private static final COSName XFA = COSName.getPDFName("XFA");

    public void rejectActiveContent(InputStream in) {
        try (PDDocument doc = Loader.loadPDF(new RandomAccessReadBuffer(in))) {
            // 逐个检查间接对象，并递归检查其中内联的字典 / 数组（页面 /AA 里的动作常常是内联的）
            for (COSObject obj : doc.getDocument().getXrefTable().keySet().stream()
                    .map(k -> doc.getDocument().getObjectFromPool(k)).toList()) {
                if (containsActive(obj.getObject(), 0)) {
                    throw reject("PDF 含有脚本或自动执行的动作，不允许上传");
                }
            }
            if (containsActive(doc.getDocumentCatalog().getCOSObject(), 0)) {
                throw reject("PDF 含有脚本或自动执行的动作，不允许上传");
            }
            COSDictionary catalog = doc.getDocumentCatalog().getCOSObject();
            if (catalog.containsKey(COSName.OPEN_ACTION) || catalog.containsKey(COSName.AA)) {
                COSBase open = catalog.getDictionaryObject(COSName.OPEN_ACTION);
                if (open instanceof COSDictionary d && isActive(d) || catalog.containsKey(COSName.AA)) {
                    throw reject("PDF 含有自动执行的动作，不允许上传");
                }
            }
        } catch (InvalidPasswordException e) {
            throw reject("不支持加密的 PDF");
        } catch (IOException e) {
            throw reject("PDF 文件已损坏或无法解析");
        }
    }

    /** 递归检查直接嵌套的对象；间接引用（COSObject）在外层循环中单独检查，这里不跟随，避免环 */
    private static boolean containsActive(COSBase base, int depth) {
        if (depth > 32 || base == null || base instanceof COSObject) {
            return false;
        }
        if (base instanceof COSDictionary d) {
            if (isActive(d)) {
                return true;
            }
            for (COSBase v : d.getValues()) {
                if (containsActive(v, depth + 1)) {
                    return true;
                }
            }
        } else if (base instanceof COSArray arr) {
            for (COSBase v : arr) {
                if (containsActive(v, depth + 1)) {
                    return true;
                }
            }
        }
        return false;
    }

    private static boolean isActive(COSDictionary d) {
        COSName s = d.getCOSName(COSName.S);
        if (JAVASCRIPT.equals(s) || LAUNCH.equals(s)) {
            return true;
        }
        return d.containsKey(JS) || d.containsKey(EMBEDDED_FILES) || d.containsKey(XFA);
    }

    private static BizException reject(String message) {
        return new BizException(ErrorCode.FILE_TYPE_NOT_ALLOWED, message);
    }
}
