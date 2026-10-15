package edu.zju.eas.common.mybatis;

import com.fasterxml.jackson.databind.JavaType;
import edu.zju.eas.common.Jsons;
import org.apache.ibatis.type.BaseTypeHandler;
import org.apache.ibatis.type.JdbcType;

import java.io.IOException;
import java.sql.CallableStatement;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Types;

/**
 * JSONB 列与 Java 对象的映射：写入时把 JDBC 参数类型设为 OTHER（由 PostgreSQL 转为 jsonb），读取时用 Jackson 反序列化。
 * 每种 Java 类型一个无参子类，避免泛型擦除带来的类型推断问题。
 */
public abstract class JsonbTypeHandler<T> extends BaseTypeHandler<T> {
    private final JavaType javaType;

    protected JsonbTypeHandler(JavaType javaType) {
        this.javaType = javaType;
    }

    @Override
    public void setNonNullParameter(PreparedStatement ps, int i, T parameter, JdbcType jdbcType) throws SQLException {
        ps.setObject(i, Jsons.write(parameter), Types.OTHER);
    }

    @Override
    public T getNullableResult(ResultSet rs, String columnName) throws SQLException {
        return parse(rs.getString(columnName));
    }

    @Override
    public T getNullableResult(ResultSet rs, int columnIndex) throws SQLException {
        return parse(rs.getString(columnIndex));
    }

    @Override
    public T getNullableResult(CallableStatement cs, int columnIndex) throws SQLException {
        return parse(cs.getString(columnIndex));
    }

    private T parse(String json) throws SQLException {
        if (json == null) {
            return null;
        }
        try {
            return Jsons.MAPPER.readValue(json, javaType);
        } catch (IOException e) {
            throw new SQLException("无法解析 JSONB 列", e);
        }
    }
}
