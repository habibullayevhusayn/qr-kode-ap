package uz.yoz.qr;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;

import androidx.core.content.ContextCompat;

public class ReminderReceiver extends BroadcastReceiver {
    private static final String[] TITLES = {
        "Kichik eslatma",
        "Yoz’dan salom",
        "Ijod uchun tanaffus"
    };
    private static final String[] MESSAGES = {
        "Yangi QR kodingiz uchun biror foydali g‘oya bormi?",
        "Muhim havolalaringizni QR kod qilib ulashishni unutmang.",
        "Keyingi loyihangiz uchun yangi QR kod yaratib ko‘ring."
    };

    @Override
    public void onReceive(Context context, Intent intent) {
        SharedPreferences preferences = context.getSharedPreferences("yoz_native_reminders", Context.MODE_PRIVATE);
        if (!preferences.getBoolean("enabled", false)) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return;

        NativeBridgePlugin.ensureNotificationChannel(context);
        int index = (int) (System.currentTimeMillis() % TITLES.length);
        Intent launchIntent = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        PendingIntent contentIntent = null;
        if (launchIntent != null) {
            launchIntent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            int flags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;
            contentIntent = PendingIntent.getActivity(context, 1208, launchIntent, flags);
        }

        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            ? new Notification.Builder(context, "yoz_qr_reminders")
            : new Notification.Builder(context);
        builder
            .setSmallIcon(android.R.drawable.ic_menu_info_details)
            .setContentTitle(TITLES[index])
            .setContentText(MESSAGES[index])
            .setAutoCancel(true)
            .setCategory(Notification.CATEGORY_REMINDER);
        if (contentIntent != null) builder.setContentIntent(contentIntent);

        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) manager.notify(1209, builder.build());
    }
}
