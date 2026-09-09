package xyz.chatboxapp.chatbox;

import android.app.Activity;
import android.graphics.Color;
import android.view.Window;

import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import androidx.core.view.WindowCompat;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "SystemBars")
public class SystemBarsPlugin extends Plugin {
    @PluginMethod
    public void setStatusBarStyle(PluginCall call) {
        String style = call.getString("style");
        if (!"light".equals(style) && !"dark".equals(style)) {
            call.reject("style must be light or dark");
            return;
        }

        Activity activity = getActivity();
        if (activity == null) {
            call.reject("Activity not available");
            return;
        }

        activity.runOnUiThread(() -> {
            Window window = activity.getWindow();
            WindowCompat.setDecorFitsSystemWindows(window, false);
            window.setStatusBarColor(Color.TRANSPARENT);
            window.setNavigationBarColor(Color.TRANSPARENT);
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.Q) {
                window.setNavigationBarContrastEnforced(false);
            }
            WindowInsetsControllerCompat controller = new WindowInsetsControllerCompat(window, window.getDecorView());
            controller.show(WindowInsetsCompat.Type.systemBars());
            controller.setAppearanceLightStatusBars("dark".equals(style));
            controller.setAppearanceLightNavigationBars("dark".equals(style));
            call.resolve();
        });
    }
}
