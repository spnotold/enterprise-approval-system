package edu.zju.eas.security;

import edu.zju.eas.IntegrationTestBase;
import edu.zju.eas.controller.PublicController;
import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.is;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;

/** 登录页据此决定是否展示演示账号：无需登录即可读取，demo profile 为 true，其余为 false */
class PublicConfigTest extends IntegrationTestBase {
    @Test
    void demoProfileIsExposedWithoutLogin() throws Exception {
        mvc.perform(get("/public/config"))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isOk())
                .andExpect(jsonPath("$.data.demo", is(true)));
    }

    @Test
    void onlyDemoProfileTurnsDemoOn() {
        assertThat(demoFlag(new MockEnvironment())).isFalse();

        MockEnvironment prod = new MockEnvironment();
        prod.setActiveProfiles("prod");
        assertThat(demoFlag(prod)).isFalse();

        MockEnvironment demo = new MockEnvironment();
        demo.setActiveProfiles("demo");
        assertThat(demoFlag(demo)).isTrue();
    }

    private static boolean demoFlag(MockEnvironment env) {
        return new PublicController(null, env).config().data().get("demo");
    }
}
