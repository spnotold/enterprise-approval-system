package edu.zju.eas.config;

import edu.zju.eas.security.AuthInfoService;
import edu.zju.eas.security.JwtAuthFilter;
import edu.zju.eas.security.RestAuthHandlers;
import edu.zju.eas.security.TokenService;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.crypto.factory.PasswordEncoderFactories;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

import static org.springframework.security.config.http.SessionCreationPolicy.STATELESS;

@Configuration
@EnableMethodSecurity  // 开启 @PreAuthorize
public class SecurityConfig {

    @Bean
    SecurityFilterChain chain(HttpSecurity http, TokenService tokenService, AuthInfoService authInfoService,
                              RestAuthHandlers handlers) throws Exception {
        JwtAuthFilter jwtFilter = new JwtAuthFilter(tokenService, authInfoService);
        http.csrf(AbstractHttpConfigurer::disable)   // 认证走 Authorization 头，不用 Cookie
                .cors(Customizer.withDefaults())
                .formLogin(AbstractHttpConfigurer::disable)
                .httpBasic(AbstractHttpConfigurer::disable)
                .logout(AbstractHttpConfigurer::disable)
                .sessionManagement(s -> s.sessionCreationPolicy(STATELESS))
                .authorizeHttpRequests(a -> a
                        // 路径不含 context-path，实际 URL 为 /api/auth/...
                        .requestMatchers("/auth/register", "/auth/login", "/auth/refresh", "/auth/logout",
                                "/auth/availability", "/public/**").permitAll()
                        // SSE 用一次性票据鉴权（EventSource 不能带请求头）
                        .requestMatchers("/notifications/stream").permitAll()
                        .requestMatchers("/actuator/health", "/error").permitAll()
                        .requestMatchers("/admin/**").hasRole("SYS_ADMIN")
                        .anyRequest().authenticated())
                .exceptionHandling(e -> e.authenticationEntryPoint(handlers).accessDeniedHandler(handlers))
                .addFilterBefore(jwtFilter, UsernamePasswordAuthenticationFilter.class);
        return http.build();
    }

    @Bean
    PasswordEncoder passwordEncoder() {
        // 存储格式 {bcrypt}$2a$10$...，以后换算法不用迁移旧数据
        return PasswordEncoderFactories.createDelegatingPasswordEncoder();
    }
}
