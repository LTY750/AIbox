package xyz.chatboxapp.chatbox;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(SecureStoragePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
