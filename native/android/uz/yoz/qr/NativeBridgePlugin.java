package uz.yoz.qr;

import android.Manifest;
import android.content.ContentValues;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

@CapacitorPlugin(
    name = "NativeBridge",
    permissions = {
        @Permission(alias = "notifications", strings = {Manifest.permission.POST_NOTIFICATIONS}),
        @Permission(alias = "storage", strings = {Manifest.permission.WRITE_EXTERNAL_STORAGE})
    }
)
public class NativeBridgePlugin extends Plugin {
    private static final String CHANNEL_ID = "yoz_qr_reminders";
    private static final String PREFS_NAME = "yoz_native_reminders";
    private static final String REMINDERS_ENABLED = "enabled";
    private static final long REMINDER_INTERVAL_MS = 2L * 60L * 60L * 1000L;

    @PluginMethod
    public void requestNotifications(PluginCall call) {
        ensureNotificationChannel();
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
            ContextCompat.checkSelfPermission(getContext(), Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) {
            resolvePermission(call, true);
            return;
        }
        requestPermissionForAlias("notifications", call, "notificationPermissionResult");
    }

    @PermissionCallback
    private void notificationPermissionResult(PluginCall call) {
        boolean granted = Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
            ContextCompat.checkSelfPermission(getContext(), Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
        resolvePermission(call, granted);
    }

    private void resolvePermission(PluginCall call, boolean granted) {
        JSObject result = new JSObject();
        result.put("granted", granted);
        call.resolve(result);
    }

    @PluginMethod
    public void scheduleReminder(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(getContext(), Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            call.reject("Bildirishnoma ruxsati berilmagan.");
            return;
        }
        ensureNotificationChannel();
        getPreferences().edit().putBoolean(REMINDERS_ENABLED, true).apply();
        ReminderScheduler.schedule(getContext(), REMINDER_INTERVAL_MS);
        call.resolve();
    }

    @PluginMethod
    public void cancelReminder(PluginCall call) {
        getPreferences().edit().putBoolean(REMINDERS_ENABLED, false).apply();
        ReminderScheduler.cancel(getContext());
        call.resolve();
    }

    @PluginMethod
    public void saveImage(PluginCall call) {
        String encodedImage = call.getString("base64");
        String requestedName = call.getString("filename", "yoz-qr.png");
        if (encodedImage == null || encodedImage.isEmpty()) {
            call.reject("Saqlash uchun QR rasm topilmadi.");
            return;
        }
        String filename = sanitizeFilename(requestedName);
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q &&
            ContextCompat.checkSelfPermission(getContext(), Manifest.permission.WRITE_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
            requestPermissionForAlias("storage", call, "galleryPermissionResult");
            return;
        }
        saveImageToGallery(call, encodedImage, filename);
    }

    @PermissionCallback
    private void galleryPermissionResult(PluginCall call) {
        if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.WRITE_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
            call.reject("Galereyaga yozish uchun xotira ruxsati kerak.");
            return;
        }
        String encodedImage = call.getString("base64");
        String filename = sanitizeFilename(call.getString("filename", "yoz-qr.png"));
        if (encodedImage == null || encodedImage.isEmpty()) {
            call.reject("Saqlash uchun QR rasm topilmadi.");
            return;
        }
        saveImageToGallery(call, encodedImage, filename);
    }

    private void saveImageToGallery(PluginCall call, String encodedImage, String filename) {
        Uri insertedImage = null;
        try {
            byte[] imageBytes = Base64.decode(encodedImage, Base64.DEFAULT);
            if (imageBytes.length == 0 || imageBytes.length > 10 * 1024 * 1024) {
                call.reject("QR rasm hajmi noto‘g‘ri.");
                return;
            }

            ContentValues values = new ContentValues();
            values.put(MediaStore.Images.Media.DISPLAY_NAME, filename);
            values.put(MediaStore.Images.Media.MIME_TYPE, "image/png");
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                values.put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/Yoz QR");
                values.put(MediaStore.Images.Media.IS_PENDING, 1);
                insertedImage = getContext().getContentResolver().insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values);
                if (insertedImage == null) throw new IllegalStateException("Rasm galereyada yaratilmagan.");
                try (OutputStream output = getContext().getContentResolver().openOutputStream(insertedImage)) {
                    if (output == null) throw new IllegalStateException("Rasm faylini ochib bo‘lmadi.");
                    output.write(imageBytes);
                }
                ContentValues ready = new ContentValues();
                ready.put(MediaStore.Images.Media.IS_PENDING, 0);
                getContext().getContentResolver().update(insertedImage, ready, null, null);
            } else {
                File pictures = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES);
                File album = new File(pictures, "Yoz QR");
                if (!album.exists() && !album.mkdirs()) throw new IllegalStateException("Galereya papkasi yaratilmadi.");
                File image = new File(album, filename);
                try (FileOutputStream output = new FileOutputStream(image)) {
                    output.write(imageBytes);
                }
                android.media.MediaScannerConnection.scanFile(getContext(), new String[] {image.getAbsolutePath()}, new String[] {"image/png"}, null);
                insertedImage = Uri.fromFile(image);
            }

            JSObject result = new JSObject();
            result.put("uri", insertedImage.toString());
            result.put("filename", filename);
            call.resolve(result);
        } catch (Exception error) {
            if (insertedImage != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                getContext().getContentResolver().delete(insertedImage, null, null);
            }
            call.reject("QR kodni telefonga saqlab bo‘lmadi.", error);
        }
    }

    private String sanitizeFilename(String filename) {
        String safeName = filename == null ? "yoz-qr.png" : filename.replaceAll("[^A-Za-z0-9._-]", "_");
        if (!safeName.toLowerCase().endsWith(".png")) safeName += ".png";
        return safeName;
    }

    private SharedPreferences getPreferences() {
        return getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    }

    static void ensureNotificationChannel(Context context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            android.app.NotificationChannel channel = new android.app.NotificationChannel(
                CHANNEL_ID,
                "Yoz QR eslatmalari",
                android.app.NotificationManager.IMPORTANCE_DEFAULT
            );
            channel.setDescription("QR kod yaratish bo‘yicha foydali eslatmalar");
            android.app.NotificationManager manager = context.getSystemService(android.app.NotificationManager.class);
            if (manager != null) manager.createNotificationChannel(channel);
        }
    }

    private void ensureNotificationChannel() {
        ensureNotificationChannel(getContext());
    }
}
