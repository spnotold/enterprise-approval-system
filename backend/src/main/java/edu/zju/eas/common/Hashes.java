package edu.zju.eas.common;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;

public final class Hashes {
    private Hashes() {
    }

    public static MessageDigest sha256() {
        try {
            return MessageDigest.getInstance("SHA-256");
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    public static String sha256Hex(String s) {
        return HexFormat.of().formatHex(sha256().digest(s.getBytes(StandardCharsets.UTF_8)));
    }

    public static String hex(byte[] digest) {
        return HexFormat.of().formatHex(digest);
    }
}
