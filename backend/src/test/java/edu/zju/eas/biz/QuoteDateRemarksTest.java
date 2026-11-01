package edu.zju.eas.biz;

import edu.zju.eas.IntegrationTestBase;
import edu.zju.eas.common.Jsons;
import edu.zju.eas.dto.app.BusinessRequests.Purchase;
import edu.zju.eas.model.app.Application;
import edu.zju.eas.response.BizException;
import edu.zju.eas.service.app.BusinessValidator;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;

class QuoteDateRemarksTest extends IntegrationTestBase {
    private static final String EMPLOYEE = "rd_emp_wang";

    @Test void incompleteDraftsAllowMissingAndFutureQuoteDates() throws Exception {
        long id = draft("purchase", EMPLOYEE, purchase(null, today().plusDays(1)));
        var dates = jdbc.queryForList("SELECT quote_date FROM purchase_quote WHERE application_id=? ORDER BY seq", id);
        assertNull(dates.get(0).get("quote_date"));
        assertEquals(today().plusDays(1), ((java.sql.Date) dates.get(1).get("quote_date")).toLocalDate());
        assertEquals("DRAFT", status(id));
    }

    @Test void submitRequiresDateOnEveryQuoteIncludingUnselectedRows() throws Exception {
        long id = draft("purchase", EMPLOYEE, purchase(null, null));
        var response = submit(id, EMPLOYEE);
        assertEquals(422, response.getResponse().getStatus());
        assertEquals(List.of("quotes[0].quoteDate", "quotes[1].quoteDate"),
                body(response).path("errors").findValuesAsText("field"));
        assertEquals(List.of("PUR_QUOTE_DATE", "PUR_QUOTE_DATE"),
                body(response).path("errors").findValuesAsText("rule"));
        assertEquals("DRAFT", status(id));
    }

    @Test void submitRejectsFutureDateOnUnselectedQuote() throws Exception {
        long id = draft("purchase", EMPLOYEE, purchase(today(), today().plusDays(1)));
        var response = submit(id, EMPLOYEE);
        assertEquals(422, response.getResponse().getStatus());
        assertEquals("quotes[1].quoteDate", body(response).path("errors").get(0).path("field").asText());
        assertEquals("PUR_QUOTE_DATE", body(response).path("errors").get(0).path("rule").asText());
    }

    @Test void singleSourceUsesSameDateRuleAndNeedsOnlyItsOneQuote() throws Exception {
        for (LocalDate date : new LocalDate[]{null, today().plusDays(1), today()}) {
            var body = purchase(date, date);
            body.put("singleSource", true);
            body.put("singleSourceReason", "原有设备只能使用原厂配套零件，因此按原厂兼容性要求采购");
            body.put("quotes", List.of(quote("唯一供应商", 1000L, date)));
            long id = draft("purchase", EMPLOYEE, body);
            var response = submit(id, EMPLOYEE);
            assertEquals(date != null && date.equals(today()) ? 200 : 422,
                    response.getResponse().getStatus(), response.getResponse().getContentAsString());
            if (date == null || date.isAfter(today())) {
                assertEquals(List.of("PUR_QUOTE_DATE"), body(response).path("errors").findValuesAsText("rule"));
            }
        }
    }

    @Test void quoteDateTodayUsesShanghaiEvenWhenClockZoneIsUtc() {
        var clock = Clock.fixed(Instant.parse("2026-10-31T16:00:00Z"), ZoneOffset.UTC);
        var validator = new BusinessValidator(null, null, null, null, null, null, clock);
        var body = purchase(LocalDate.of(2026, 11, 1), LocalDate.of(2026, 11, 1));
        body.put("expectedArrivalDate", "2026-11-02");
        assertDoesNotThrow(() -> validator.validate(new Application(), Jsons.convert(body, Purchase.class), true));
        var previous = new BusinessValidator(null, null, null, null, null, null,
                Clock.fixed(Instant.parse("2026-10-31T15:59:59Z"), ZoneOffset.UTC));
        assertThrows(BizException.class, () -> previous.validate(new Application(), Jsons.convert(body, Purchase.class), true));
    }

    @Test void purchaseRemarkAndDatesRoundTripThroughSaveCopyAndResubmit() throws Exception {
        var request = purchase(today().minusDays(2), today());
        request.put("remark", "采".repeat(500));
        long source = submitted("purchase", EMPLOYEE, request);
        var original = data(call(get("/applications/" + source), EMPLOYEE, null)).path("purchase");
        assertEquals(request.get("remark"), original.path("remark").asText());
        assertEquals(request.get("remark"), jdbc.queryForObject("SELECT remark FROM purchase_detail WHERE application_id=?", String.class, source));
        long target = copyWithdrawn(source);
        var copied = data(call(get("/applications/" + target), EMPLOYEE, null)).path("purchase");
        assertEquals(original.path("remark"), copied.path("remark"));
        assertEquals(0, copied.path("selectedQuoteIndex").asInt());
        for (int i = 0; i < 2; i++) {
            assertEquals(original.path("quotes").get(i).path("quoteDate"), copied.path("quotes").get(i).path("quoteDate"));
            assertNotEquals(original.path("quotes").get(i).path("id"), copied.path("quotes").get(i).path("id"));
        }
        assertEquals(200, submit(target, EMPLOYEE).getResponse().getStatus());
        // 清空草稿备注后不保留旧值。
        long cleared = copyWithdrawn(target);
        request.put("remark", null);
        request.put("version", version(cleared));
        assertEquals(200, call(put("/applications/" + cleared + "/purchase"), EMPLOYEE, request).getResponse().getStatus());
        assertNull(jdbc.queryForObject("SELECT remark FROM purchase_detail WHERE application_id=?", String.class, cleared));
    }

    @Test void expenseRemarkStaysSeparateFromDescriptionAndSurvivesCopyResubmit() throws Exception {
        var request = expenseBody(List.of(expenseItem(1000)));
        request.put("description", "报销说明保持不变");
        request.put("remark", "销".repeat(500));
        long source = submitted("expense", EMPLOYEE, request);
        long target = copyWithdrawn(source);
        var copied = data(call(get("/applications/" + target), EMPLOYEE, null)).path("expense");
        assertEquals(request.get("description"), copied.path("description").asText());
        assertEquals(request.get("remark"), copied.path("remark").asText());
        assertEquals(request.get("remark"), jdbc.queryForObject("SELECT remark FROM expense_detail WHERE application_id=?", String.class, target));
        assertEquals(200, submit(target, EMPLOYEE).getResponse().getStatus());
        long cleared = copyWithdrawn(target);
        request.put("remark", null);
        request.put("version", version(cleared));
        assertEquals(200, call(put("/applications/" + cleared + "/expense"), EMPLOYEE, request).getResponse().getStatus());
        assertNull(jdbc.queryForObject("SELECT remark FROM expense_detail WHERE application_id=?", String.class, cleared));
    }

    @Test void optionalRemarksAreLimitedTo500CharactersOnDraftSave() throws Exception {
        for (String type : List.of("purchase", "expense")) {
            Map<String, Object> request = type.equals("purchase") ? purchase(today(), today()) : expenseBody(List.of(expenseItem(1000)));
            long id = submitted(type, EMPLOYEE, request);
            assertEquals("IN_APPROVAL", status(id));
            request.put("remark", "备".repeat(501));
            var response = call(post("/applications/" + type), EMPLOYEE, request);
            assertEquals(400, response.getResponse().getStatus());
            assertTrue(body(response).path("errors").findValuesAsText("field").contains("remark"));
        }
    }

    @Test void extremeQuoteYearIsRejectedBeforeDatabaseWrite() throws Exception {
        var request = purchase(today(), today());
        request.put("quotes", List.of(quote("极端年份", 1000L, LocalDate.of(6000000, 1, 1))));
        var response = call(post("/applications/purchase"), EMPLOYEE, request);
        assertEquals(400, response.getResponse().getStatus());
        assertEquals("DATE_RANGE", body(response).path("errors").get(0).path("rule").asText());
        assertEquals("quotes[0].quoteDate", body(response).path("errors").get(0).path("field").asText());
    }

    private long copyWithdrawn(long source) throws Exception {
        assertEquals(200, action("/applications/" + source + "/withdraw", EMPLOYEE,
                map("appVersion", version(source)), key()).getResponse().getStatus());
        var response = call(post("/applications/" + source + "/copy"), EMPLOYEE, null);
        assertEquals(200, response.getResponse().getStatus(), response.getResponse().getContentAsString());
        return data(response).path("id").asLong();
    }

    private LocalDate today() { return LocalDate.now(CN); }

    private Map<String, Object> quote(String supplier, long amount, LocalDate date) {
        return map("supplierName", supplier, "channel", "OFFLINE", "quoteAmountCents", amount,
                "description", "含税包邮", "quoteDate", date == null ? null : date.toString());
    }

    private Map<String, Object> purchase(LocalDate first, LocalDate second) {
        return map("title", "报价日期与备注", "reason", "办公设备采购", "budgetLimitCents", 5000,
                "expectedArrivalDate", today().plusDays(2).toString(), "selectedQuoteIndex", 0,
                "items", List.of(map("name", "配件", "unit", "件", "quantity", "1", "unitPriceCents", 1000)),
                "quotes", List.of(quote("供应商甲", 1000, first), quote("供应商乙", 2000, second)));
    }
}
