package edu.zju.eas.biz;

import edu.zju.eas.IntegrationTestBase;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MvcResult;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;

/** T06 字段篡改、T07 金额重算、T08 同单重复票据、T09 文件类型 */
class BusinessRulesTest extends IntegrationTestBase {

    @Test
    void t06_clientCannotOverrideApplicantOrTotals() throws Exception {
        long app = draft("expense", "rd_emp_wang", expenseBody(List.of(expenseItem(12_345))));
        var tampered = expenseBody(List.of(expenseItem(12_345)));
        tampered.put("version", version(app));
        tampered.put("applicantId", uid("rd_emp_chen"));
        tampered.put("totalAmountCents", 1);
        tampered.put("status", "APPROVED");
        MvcResult saved = call(put("/applications/" + app + "/expense"), "rd_emp_wang", tampered);
        assertThat(saved.getResponse().getStatus()).as(saved.getResponse().getContentAsString()).isEqualTo(200);
        MvcResult submit = action("/applications/" + app + "/submit", "rd_emp_wang",
                map("appVersion", version(app), "applicantId", uid("rd_emp_chen"), "totalAmountCents", 1), key());
        assertThat(submit.getResponse().getStatus()).isEqualTo(200);
        var row = jdbc.queryForMap("SELECT applicant_id, amount_cents, status FROM application WHERE id = ?", app);
        assertThat(row.get("applicant_id")).isEqualTo(uid("rd_emp_wang"));
        assertThat(row.get("amount_cents")).isEqualTo(12_345L);
        assertThat(row.get("status")).isEqualTo("IN_APPROVAL");
    }

    @Test
    void t07_totalIsRecomputedInCents() throws Exception {
        long app = draft("expense", "rd_emp_wang", expenseBody(List.of(expenseItem(10), expenseItem(20))));
        assertThat(jdbc.queryForObject("SELECT amount_cents FROM application WHERE id = ?", Long.class, app)).isEqualTo(30L);
    }

    @Test
    void t08_sameInvoiceFileTwiceInOneReport() throws Exception {
        long file = jdbc.queryForObject("""
                INSERT INTO attachment (uploader_id, ref_type, original_name, storage_key, content_type, size_bytes, sha256)
                VALUES (?, 'EXPENSE_INVOICE', 'invoice.png', 'it/invoice-1', 'image/png', 1024, repeat('a', 64)) RETURNING id
                """, Long.class, uid("rd_emp_wang"));
        var item = map("expenseTypeCode", "TRANSPORT", "occurDate", java.time.LocalDate.now(CN).minusDays(1).toString(),
                "purpose", "打车", "amountCents", 3_000, "noInvoice", false,
                "invoices", List.of(map("attachmentId", file)));
        var body = expenseBody(List.of(item, item));
        MvcResult r = call(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post("/applications/expense"),
                "rd_emp_wang", body);
        assertThat(r.getResponse().getStatus()).as(r.getResponse().getContentAsString()).isEqualTo(422);
        assertThat(body(r).path("errors").findValuesAsText("rule")).contains("EXP_DUP_INVOICE_IN_APP");
    }

    @Test
    void t09_renamedExecutableIsRejected() throws Exception {
        byte[] exe = new byte[512];
        exe[0] = 'M'; exe[1] = 'Z';
        System.arraycopy("This program cannot be run in DOS mode".getBytes(), 0, exe, 78, 38);
        var file = new MockMultipartFile("file", "photo.png", "image/png", exe);
        MvcResult r = call(multipart("/files").file(file).param("refType", "EXPENSE_INVOICE"), "rd_emp_wang", null);
        assertThat(r.getResponse().getStatus()).isEqualTo(415);
        assertThat(code(r)).isEqualTo(41501);
    }
}
