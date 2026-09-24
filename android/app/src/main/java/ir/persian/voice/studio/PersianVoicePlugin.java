package ir.persian.voice.studio;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.provider.MediaStore;
import android.content.ContentValues;
import android.os.Bundle;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

@CapacitorPlugin(name = "PersianVoice")
public class PersianVoicePlugin extends Plugin {
    private TextToSpeech tts;

    @Override
    public void load() {
        super.load();
        tts = new TextToSpeech(getContext(), status -> {
            if (status == TextToSpeech.SUCCESS) tts.setLanguage(new Locale("fa", "IR"));
        });
    }

    @PluginMethod
    public void saveBase64Audio(PluginCall call) {
        try {
            String base64 = call.getString("base64", "");
            String extension = call.getString("extension", "mp3");
            if (base64.isEmpty()) { call.reject("داده صوتی خالی است."); return; }
            byte[] data = android.util.Base64.decode(base64, android.util.Base64.DEFAULT);
            String safeExt = extension.matches("[a-zA-Z0-9]{2,5}") ? extension.toLowerCase(Locale.ROOT) : "mp3";
            File out = new File(getContext().getCacheDir(), "voice_" + System.currentTimeMillis() + "." + safeExt);
            try (FileOutputStream fos = new FileOutputStream(out)) { fos.write(data); }
            JSObject ret = new JSObject();
            ret.put("path", out.getAbsolutePath());
            ret.put("name", out.getName());
            call.resolve(ret);
        } catch(Exception e) { call.reject("ذخیره صدای دریافتی ناموفق بود: " + e.getMessage()); }
    }

    @PluginMethod
    public void synthesizeOffline(PluginCall call) {
        String text = call.getString("text", "");
        float rate = (float)call.getDouble("rate", 1.0);
        float pitch = (float)call.getDouble("pitch", 1.0);
        if (text.isEmpty()) { call.reject("متن خالی است."); return; }
        if (tts == null) { call.reject("موتور TTS آماده نیست."); return; }

        bridge.getActivity().runOnUiThread(() -> {
            int lang = tts.setLanguage(new Locale("fa", "IR"));
            if (lang == TextToSpeech.LANG_MISSING_DATA || lang == TextToSpeech.LANG_NOT_SUPPORTED) {
                call.reject("موتور TTS نصب‌شده روی گوشی زبان فارسی را ندارد.");
                return;
            }
            tts.setSpeechRate(rate);
            tts.setPitch(pitch);
            File out = new File(getContext().getCacheDir(), "voice_" + System.currentTimeMillis() + ".wav");
            String utteranceId = "offline_" + System.currentTimeMillis();
            tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                @Override public void onStart(String id) {}
                @Override public void onDone(String id) {
                    if (!utteranceId.equals(id)) return;
                    JSObject ret = new JSObject();
                    ret.put("path", out.getAbsolutePath());
                    ret.put("name", out.getName());
                    call.resolve(ret);
                }
                @Override public void onError(String id) {
                    if (utteranceId.equals(id)) call.reject("تولید صدای آفلاین ناموفق بود.");
                }
            });
            int result = tts.synthesizeToFile(text, new Bundle(), out, utteranceId);
            if (result != TextToSpeech.SUCCESS) call.reject("موتور TTS نتوانست فایل صوتی بسازد.");
        });
    }

    @PluginMethod
    public void checkOfflineTts(PluginCall call) {
        try {
            if (tts == null) { call.reject("موتور TTS آماده نیست."); return; }
            int result=tts.isLanguageAvailable(new Locale("fa","IR"));
            JSObject ret=new JSObject();ret.put("supported",result>=TextToSpeech.LANG_AVAILABLE);ret.put("engine",tts.getDefaultEngine());call.resolve(ret);
        } catch(Exception e){call.reject("بررسی موتور آفلاین ناموفق بود: "+e.getMessage());}
    }

    @PluginMethod
    public void saveToDownloads(PluginCall call) {
        String path = call.getString("path", "");
        String fileName = call.getString("fileName", "AvayeIranAzad.mp3");
        try {
            File source = new File(path);
            if (!source.exists()) throw new IllegalStateException("فایل خروجی پیدا نشد.");
            String mime = fileName.toLowerCase(Locale.ROOT).endsWith(".wav") ? "audio/wav" : "audio/mpeg";

            if (android.os.Build.VERSION.SDK_INT >= 29) {
                ContentValues values = new ContentValues();
                values.put(MediaStore.Audio.Media.DISPLAY_NAME, fileName);
                values.put(MediaStore.Audio.Media.MIME_TYPE, mime);
                values.put(MediaStore.Audio.Media.RELATIVE_PATH, android.os.Environment.DIRECTORY_MUSIC + "/Avaye Iran Azad");
                values.put(MediaStore.Audio.Media.IS_PENDING, 1);
                Uri uri = getContext().getContentResolver().insert(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, values);
                if (uri == null) throw new IllegalStateException("فضای ذخیره‌سازی در دسترس نیست.");
                try (InputStream in = new java.io.FileInputStream(source);
                     OutputStream out = getContext().getContentResolver().openOutputStream(uri)) {
                    if (out == null) throw new IllegalStateException("نوشتن فایل ممکن نیست.");
                    byte[] buf = new byte[8192]; int n;
                    while ((n = in.read(buf)) != -1) out.write(buf, 0, n);
                }
                ContentValues done = new ContentValues();
                done.put(MediaStore.Audio.Media.IS_PENDING, 0);
                getContext().getContentResolver().update(uri, done, null, null);
                JSObject ret = new JSObject(); ret.put("uri", uri.toString()); call.resolve(ret);
            } else {
                File dir = new File(android.os.Environment.getExternalStoragePublicDirectory(android.os.Environment.DIRECTORY_MUSIC), "Avaye Iran Azad");
                if (!dir.exists() && !dir.mkdirs()) throw new IllegalStateException("ساخت پوشه ممکن نیست.");
                File dest = new File(dir, fileName);
                copy(source, dest);
                JSObject ret = new JSObject(); ret.put("path", dest.getAbsolutePath()); call.resolve(ret);
            }
        } catch(Exception e) { call.reject("ذخیره فایل ناموفق بود: " + e.getMessage()); }
    }

    @PluginMethod
    public void shareAudio(PluginCall call) {
        try {
            File file = new File(call.getString("path", ""));
            Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName()+".fileprovider", file);
            Intent send = new Intent(Intent.ACTION_SEND);
            send.setType("audio/*"); send.putExtra(Intent.EXTRA_STREAM, uri);
            send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            getContext().startActivity(Intent.createChooser(send, "اشتراک‌گذاری صدا"));
            call.resolve();
        } catch(Exception e) { call.reject("اشتراک‌گذاری ناموفق بود: " + e.getMessage()); }
    }

    private static String quote(String s) {
        return "\"" + s.replace("\\","\\\\").replace("\"","\\\"").replace("\n","\\n").replace("\r","\\r") + "\"";
    }
    private static byte[] readAll(InputStream in) throws Exception {
        java.io.ByteArrayOutputStream b = new java.io.ByteArrayOutputStream();
        byte[] x = new byte[8192]; int n; while((n=in.read(x))!=-1)b.write(x,0,n); return b.toByteArray();
    }
    private static void copy(File a, File b) throws Exception {
        try(InputStream in=new java.io.FileInputStream(a); OutputStream out=new FileOutputStream(b)){
            byte[] x=new byte[8192]; int n; while((n=in.read(x))!=-1)out.write(x,0,n);
        }
    }
    @Override public void handleOnDestroy() { if(tts!=null){tts.stop();tts.shutdown();} super.handleOnDestroy(); }
}