package dev.mi13.agent;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.content.Context;
import android.util.Base64;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

public final class SecureStore {
    private static final String NAME="mi13-agent-api-key-v1";
    private static SecretKey getKey() throws Exception {
        KeyStore s=KeyStore.getInstance("AndroidKeyStore");
        s.load(null);
        if(s.containsAlias(NAME))return (SecretKey)s.getKey(NAME,null);
        KeyGenerator gen=KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore");
        KeyGenParameterSpec spec=new KeyGenParameterSpec.Builder(NAME,
          KeyProperties.PURPOSE_ENCRYPT|KeyProperties.PURPOSE_DECRYPT)
          .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
          .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
          .setKeySize(256).build();
        gen.init(spec);
        return gen.generateKey();
    }
    public static void save(Context ctx,String value)throws Exception{
        Cipher c=Cipher.getInstance("AES/GCM/NoPadding");
        c.init(Cipher.ENCRYPT_MODE,getKey());
        byte[] iv=c.getIV();
        byte[] payload=c.doFinal(value.getBytes("UTF-8"));
        byte[] combined=new byte[iv.length+payload.length];
        System.arraycopy(iv,0,combined,0,iv.length);
        System.arraycopy(payload,0,combined,iv.length,payload.length);
        ctx.getSharedPreferences("private",0).edit()
           .putString("encrypted_key",Base64.encodeToString(combined,Base64.NO_WRAP)).apply();
    }
    public static String load(Context ctx){
        try{
            String data=ctx.getSharedPreferences("private",0).getString("encrypted_key","");
            if(data.isEmpty())return "";
            byte[] b=Base64.decode(data,Base64.NO_WRAP);
            if(b.length<28)return "";
            Cipher c=Cipher.getInstance("AES/GCM/NoPadding");
            c.init(Cipher.DECRYPT_MODE,getKey(),new GCMParameterSpec(128,b,0,12));
            byte[] value=c.doFinal(b,12,b.length-12);
            return new String(value,"UTF-8");
        }catch(Exception e){return "";}
    }
    public static void clear(Context ctx){
        ctx.getSharedPreferences("private",0).edit().remove("encrypted_key").apply();
    }
}