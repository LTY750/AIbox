package xyz.chatboxapp.chatbox;

import android.animation.ValueAnimator;
import android.graphics.Color;
import android.os.Bundle;
import android.view.View;
import android.webkit.WebView;
import android.view.animation.DecelerateInterpolator;

import androidx.activity.BackEventCompat;
import androidx.activity.OnBackPressedCallback;
import androidx.core.view.WindowCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private OnBackPressedCallback predictiveBackCallback;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SecureStoragePlugin.class);
        registerPlugin(SystemBarsPlugin.class);
        super.onCreate(savedInstanceState);
        configureEdgeToEdge();
        installPredictiveBackPageAnimation();
    }

    private void configureEdgeToEdge() {
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        getWindow().setStatusBarColor(Color.TRANSPARENT);
        getWindow().setNavigationBarColor(Color.TRANSPARENT);
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.Q) {
            getWindow().setNavigationBarContrastEnforced(false);
        }
    }

    /**
     * Let Android own the edge affordance and gesture. This callback only
     * drives the outgoing WebView visual; the existing Capacitor/App/router
     * back stack remains responsible for the actual navigation.
     */
    private void configureWebViewOverscroll() {
        WebView webView = getBridge() == null ? null : getBridge().getWebView();
        if (webView == null) {
            getWindow().getDecorView().post(this::configureWebViewOverscroll);
            return;
        }
        webView.setOverScrollMode(View.OVER_SCROLL_ALWAYS);
        webView.setVerticalScrollBarEnabled(false);
        webView.setHorizontalScrollBarEnabled(false);
    }
    private void installPredictiveBackPageAnimation() {
        predictiveBackCallback = new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackStarted(BackEventCompat backEvent) {
                updatePredictiveBackPage(backEvent.getProgress());
            }

            @Override
            public void handleOnBackProgressed(BackEventCompat backEvent) {
                updatePredictiveBackPage(backEvent.getProgress());
            }

            @Override
            public void handleOnBackCancelled() {
                animatePredictiveBackPageTo(0f);
            }

            @Override
            public void handleOnBackPressed() {
                // Temporarily step aside so Capacitor's existing callback can
                // dispatch overlays, router history, or app exit as before.
                setEnabled(false);
                getOnBackPressedDispatcher().onBackPressed();
                getWindow().getDecorView().postDelayed(() -> {
                    restoreWebViewAlpha();
                    if (!isFinishing() && !isDestroyed()) {
                        setEnabled(true);
                    }
                }, 220L);
            }
        };
        getOnBackPressedDispatcher().addCallback(this, predictiveBackCallback);
    }

    private View getWebView() {
        return getBridge() == null ? null : getBridge().getWebView();
    }

    private void updatePredictiveBackPage(float progress) {
        View webView = getWebView();
        if (webView == null) {
            return;
        }
        float clampedProgress = Math.max(0f, Math.min(1f, progress));
        // The reference transition is primarily a fade, not a horizontal
        // page translation. Keep the effect subtle so text stays readable.
        webView.setAlpha(1f - 0.12f * clampedProgress);
    }

    private void animatePredictiveBackPageTo(float targetProgress) {
        View webView = getWebView();
        if (webView == null) {
            return;
        }
        float startAlpha = webView.getAlpha();
        float targetAlpha = 1f - 0.12f * Math.max(0f, Math.min(1f, targetProgress));
        ValueAnimator animator = ValueAnimator.ofFloat(startAlpha, targetAlpha);
        animator.setDuration(150L);
        animator.setInterpolator(new DecelerateInterpolator());
        animator.addUpdateListener(valueAnimator -> webView.setAlpha((float) valueAnimator.getAnimatedValue()));
        animator.start();
    }

    private void restoreWebViewAlpha() {
        View webView = getWebView();
        if (webView != null) {
            webView.setAlpha(1f);
        }
    }

    @Override
    public void onDestroy() {
        if (predictiveBackCallback != null) {
            predictiveBackCallback.remove();
        }
        super.onDestroy();
    }
}
