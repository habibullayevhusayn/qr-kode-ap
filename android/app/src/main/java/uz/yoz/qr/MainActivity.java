package uz.yoz.qr;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import uz.yoz.qr.NativeBridgePlugin;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(NativeBridgePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
