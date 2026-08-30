package xyz.chatboxapp.chatbox;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import android.util.Base64;

@CapacitorPlugin(name = "SecureStorage")
public class SecureStoragePlugin extends Plugin {
    private static final String PREFS = "chatbox_secure_storage";
    private static final String KEY_ALIAS = "chatbox_secure_storage_key";
    private static final String VALUE_SUFFIX = ".value";
    private static final String IV_SUFFIX = ".iv";
    private static final Object KEY_LOCK = new Object();

    @PluginMethod
    public void set(PluginCall call) {
        String key = call.getString("key");
        String value = call.getString("value");
        if (key == null || value == null) { call.reject("key and value are required"); return; }
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            // Android Keystore requires randomized encryption and rejects caller-provided IVs.
            cipher.init(Cipher.ENCRYPT_MODE, getSecretKey());
            byte[] iv = cipher.getIV();
            byte[] encrypted = cipher.doFinal(value.getBytes(StandardCharsets.UTF_8));
            boolean committed = prefs().edit()
                .putString(key + VALUE_SUFFIX, Base64.encodeToString(encrypted, Base64.NO_WRAP))
                .putString(key + IV_SUFFIX, Base64.encodeToString(iv, Base64.NO_WRAP))
                .commit();
            if (!committed) { call.reject("Unable to persist secure value"); return; }
            call.resolve();
        } catch (Exception e) { call.reject("Unable to write secure value", e); }
    }

    @PluginMethod
    public void get(PluginCall call) {
        String key = call.getString("key");
        if (key == null) { call.reject("key is required"); return; }
        try {
            String encoded = prefs().getString(key + VALUE_SUFFIX, null);
            String encodedIv = prefs().getString(key + IV_SUFFIX, null);
            JSObject result = new JSObject();
            if (encoded == null || encodedIv == null) { result.put("value", null); call.resolve(result); return; }
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, getSecretKey(), new GCMParameterSpec(128, Base64.decode(encodedIv, Base64.NO_WRAP)));
            result.put("value", new String(cipher.doFinal(Base64.decode(encoded, Base64.NO_WRAP)), StandardCharsets.UTF_8));
            call.resolve(result);
        } catch (Exception e) { call.reject("Unable to read secure value", "SECURE_STORAGE_READ_FAILED", e); }
    }

    @PluginMethod
    public void remove(PluginCall call) {
        String key = call.getString("key");
        if (key == null) { call.reject("key is required"); return; }
        if (!prefs().edit().remove(key + VALUE_SUFFIX).remove(key + IV_SUFFIX).commit()) {
            call.reject("Unable to remove secure value");
            return;
        }
        call.resolve();
    }

    private SharedPreferences prefs() { return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE); }

    private SecretKey getSecretKey() throws Exception {
        // Keystore alias lookup and generation must be one atomic operation.
        // Without the lock, concurrent first reads/writes can both observe a
        // missing alias and race to generate the same key.
        synchronized (KEY_LOCK) {
            KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
            keyStore.load(null);
            if (keyStore.containsAlias(KEY_ALIAS)) {
                return ((KeyStore.SecretKeyEntry) keyStore.getEntry(KEY_ALIAS, null)).getSecretKey();
            }
            KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
            generator.init(new KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setUserAuthenticationRequired(false)
                .build());
            return generator.generateKey();
        }
    }
}
