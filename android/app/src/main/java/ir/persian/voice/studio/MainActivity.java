package ir.persian.voice.studio;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PersianVoicePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
