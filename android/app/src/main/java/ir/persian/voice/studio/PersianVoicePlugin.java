package ir.persian.voice.studio;

import android.content.ContentValues;
import android.content.Intent;
import android.net.Uri;
import android.provider.MediaStore;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.Locale;

@CapacitorPlugin(name = "PersianVoice")
public class PersianVoicePlugin extends Plugin {
    @PluginMethod
    public void saveBase64Audio(PluginCall call) {
        try {
            String base64 = call.getString("base64", "");
            String extension = call.getString("extension", "wav");
            if (base64.isEmpty()) { call.reject("داده صوتی خالی است."); return; }
            byte[] data = android.util.Base64.decode(base64, android.util.Base64.DEFAULT);
            String safeExt = extension.matches("[a-zA-Z0-9]{2,5}") ? extension.toLowerCase(Locale.ROOT) : "wav";
            File out = new File(getContext().getCacheDir(), "voice_" + System.currentTimeMillis() + "." + safeExt);
            try (FileOutputStream fos = new FileOutputStream(out)) { fos.write(data); }
            JSObject ret = new JSObject();
            ret.put("path", out.getAbsolutePath());
            ret.put("name", out.getName());
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("ذخیره صدای دریافتی ناموفق بود: " + e.getMessage());
        }
    }

    @PluginMethod
    public void saveToDownloads(PluginCall call) {
        String path = call.getString("path", "");
        String fileName = call.getString("fileName", "AvayeIranAzad.wav");
        boolean downloadsFolder = "downloads".equalsIgnoreCase(call.getString("directory", "music"));
        try {
            File source = new File(path);
            if (!source.exists()) throw new IllegalStateException("فایل خروجی پیدا نشد.");
            String mime = fileName.toLowerCase(Locale.ROOT).endsWith(".wav") ? "audio/wav" : "audio/mpeg";

            if (android.os.Build.VERSION.SDK_INT >= 29) {
                ContentValues values = new ContentValues();
                values.put(MediaStore.Audio.Media.DISPLAY_NAME, fileName);
                values.put(MediaStore.Audio.Media.MIME_TYPE, mime);
                String publicDirectory = downloadsFolder
                        ? android.os.Environment.DIRECTORY_DOWNLOADS
                        : android.os.Environment.DIRECTORY_MUSIC;
                values.put(MediaStore.Audio.Media.RELATIVE_PATH, publicDirectory + "/Avaye Iran Azad");
                values.put(MediaStore.Audio.Media.IS_PENDING, 1);
                Uri collection = downloadsFolder
                        ? MediaStore.Downloads.EXTERNAL_CONTENT_URI
                        : MediaStore.Audio.Media.EXTERNAL_CONTENT_URI;
                Uri uri = getContext().getContentResolver().insert(collection, values);
                if (uri == null) throw new IllegalStateException("فضای ذخیره‌سازی در دسترس نیست.");
                try (InputStream in = new FileInputStream(source);
                     OutputStream out = getContext().getContentResolver().openOutputStream(uri)) {
                    if (out == null) throw new IllegalStateException("نوشتن فایل ممکن نیست.");
                    byte[] buf = new byte[8192];
                    int n;
                    while ((n = in.read(buf)) != -1) out.write(buf, 0, n);
                }
                ContentValues done = new ContentValues();
                done.put(MediaStore.Audio.Media.IS_PENDING, 0);
                getContext().getContentResolver().update(uri, done, null, null);
                JSObject ret = new JSObject();
                ret.put("uri", uri.toString());
                call.resolve(ret);
            } else {
                String publicDirectory = downloadsFolder
                        ? android.os.Environment.DIRECTORY_DOWNLOADS
                        : android.os.Environment.DIRECTORY_MUSIC;
                File dir = new File(android.os.Environment.getExternalStoragePublicDirectory(publicDirectory), "Avaye Iran Azad");
                if (!dir.exists() && !dir.mkdirs()) throw new IllegalStateException("ساخت پوشه ممکن نیست.");
                File dest = new File(dir, fileName);
                copy(source, dest);
                JSObject ret = new JSObject();
                ret.put("path", dest.getAbsolutePath());
                call.resolve(ret);
            }
        } catch (Exception e) {
            call.reject("ذخیره فایل ناموفق بود: " + e.getMessage());
        }
    }

    @PluginMethod
    public void shareAudio(PluginCall call) {
        try {
            File file = new File(call.getString("path", ""));
            Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", file);
            Intent send = new Intent(Intent.ACTION_SEND);
            send.setType("audio/wav");
            send.putExtra(Intent.EXTRA_STREAM, uri);
            send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            getContext().startActivity(Intent.createChooser(send, "اشتراک‌گذاری صدا"));
            call.resolve();
        } catch (Exception e) {
            call.reject("اشتراک‌گذاری ناموفق بود: " + e.getMessage());
        }
    }

    private static void copy(File source, File destination) throws Exception {
        try (InputStream in = new FileInputStream(source); OutputStream out = new FileOutputStream(destination)) {
            byte[] buffer = new byte[8192];
            int count;
            while ((count = in.read(buffer)) != -1) out.write(buffer, 0, count);
        }
    }
}
