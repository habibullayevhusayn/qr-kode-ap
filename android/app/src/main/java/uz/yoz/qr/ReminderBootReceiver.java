package uz.yoz.qr;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;

public class ReminderBootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (!Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) return;
        SharedPreferences preferences = context.getSharedPreferences("yoz_native_reminders", Context.MODE_PRIVATE);
        if (preferences.getBoolean("enabled", false)) ReminderScheduler.scheduleStandard(context);
    }
}
