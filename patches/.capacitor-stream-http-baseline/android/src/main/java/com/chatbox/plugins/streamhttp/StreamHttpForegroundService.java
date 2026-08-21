package com.chatbox.plugins.streamhttp;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;

import java.lang.ref.WeakReference;

/**
 * Keeps native HTTP streams alive while the Capacitor Activity is backgrounded.
 *
 * Request configuration lives in StreamHttpStreamManager, so the Intent only
 * contains a generated stream ID and never exposes API keys or request bodies.
 */
public final class StreamHttpForegroundService extends Service {
    static final String ACTION_START = "com.chatbox.plugins.streamhttp.action.START";
    private static final String ACTION_CANCEL_ALL = "com.chatbox.plugins.streamhttp.action.CANCEL_ALL";
    private static final String EXTRA_STREAM_ID = "streamId";
    private static final String CHANNEL_ID = "chatbox_streaming";
    private static final int NOTIFICATION_ID = 74_001;
    private static final long WAKE_LOCK_RENEWAL_MS = 9 * 60 * 1000L;
    private static final long WAKE_LOCK_TIMEOUT_MS = 10 * 60 * 1000L;

    private static volatile WeakReference<StreamHttpForegroundService> currentService = new WeakReference<>(null);

    private final Handler handler = new Handler(Looper.getMainLooper());
    private PowerManager.WakeLock wakeLock;
    private boolean destroyed;
    private volatile int latestStartId;

    public static void start(Context context, String streamId) {
        Intent intent = new Intent(context, StreamHttpForegroundService.class)
            .setAction(ACTION_START)
            .putExtra(EXTRA_STREAM_ID, streamId);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(intent);
        } else {
            context.startService(intent);
        }
    }

    static void refresh() {
        StreamHttpForegroundService service = currentService.get();
        if (service != null) {
            service.refreshForegroundState();
        }
    }

    @Override
    public void onCreate() {
        super.onCreate();
        currentService = new WeakReference<>(this);
        createNotificationChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        latestStartId = Math.max(latestStartId, startId);
        // Android requires a foreground service to publish its notification promptly.
        ensureForeground();

        String action = intent == null ? null : intent.getAction();
        if (ACTION_CANCEL_ALL.equals(action)) {
            StreamHttpStreamManager.getInstance().cancelAll();
        } else if (ACTION_START.equals(action)) {
            String streamId = intent.getStringExtra(EXTRA_STREAM_ID);
            if (streamId != null) {
                StreamHttpStreamManager.getInstance().start(streamId);
            }
        }
        refreshForegroundState();
        return START_NOT_STICKY;
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        // Keep the service alive after the Activity task is backgrounded or removed.
        super.onTaskRemoved(rootIntent);
    }

    @Override
    public void onDestroy() {
        destroyed = true;
        handler.removeCallbacksAndMessages(null);
        releaseWakeLock();
        StreamHttpForegroundService existing = currentService.get();
        if (existing == this) {
            currentService = new WeakReference<>(null);
        }
        StreamHttpStreamManager.getInstance().onServiceDestroyed();
        super.onDestroy();
    }

    private void refreshForegroundState() {
        if (destroyed) {
            return;
        }
        if (StreamHttpStreamManager.getInstance().getActiveCount() == 0) {
            handler.removeCallbacksAndMessages(null);
            releaseWakeLock();
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                stopForeground(STOP_FOREGROUND_REMOVE);
            } else {
                stopForeground(true);
            }
            stopSelfResult(latestStartId);
            return;
        }
        ensureForeground();
    }

    private void ensureForeground() {
        if (destroyed) {
            return;
        }
        int activeCount = Math.max(1, StreamHttpStreamManager.getInstance().getActiveCount());
        Notification notification = buildNotification(activeCount);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, notification, android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }
        acquireWakeLock();
    }

    private Notification buildNotification(int activeCount) {
        Intent cancelIntent = new Intent(this, StreamHttpForegroundService.class).setAction(ACTION_CANCEL_ALL);
        int pendingIntentFlags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            pendingIntentFlags |= PendingIntent.FLAG_IMMUTABLE;
        }
        PendingIntent cancelPendingIntent = PendingIntent.getService(this, 0, cancelIntent, pendingIntentFlags);

        String appName = getApplicationLabel();
        String content = activeCount == 1 ? "Generating a response" : "Generating " + activeCount + " responses";
        Notification.Builder builder;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            builder = new Notification.Builder(this, CHANNEL_ID);
        } else {
            builder = new Notification.Builder(this);
        }
        builder
            .setSmallIcon(android.R.drawable.stat_sys_upload)
            .setContentTitle(appName)
            .setContentText(content)
            .setCategory(Notification.CATEGORY_SERVICE)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setShowWhen(false)
            .addAction(new Notification.Action.Builder(android.R.drawable.ic_menu_close_clear_cancel, "Stop", cancelPendingIntent).build());
        return builder.build();
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return;
        }
        NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "Response generation", NotificationManager.IMPORTANCE_LOW);
        channel.setDescription("Keeps an AI response running while Chatbox is in the background");
        channel.setShowBadge(false);
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager != null) {
            manager.createNotificationChannel(channel);
        }
    }

    private String getApplicationLabel() {
        ApplicationInfo applicationInfo = getApplicationInfo();
        CharSequence label = getPackageManager().getApplicationLabel(applicationInfo);
        return label == null ? "Chatbox" : label.toString();
    }

    private void acquireWakeLock() {
        if (wakeLock == null) {
            PowerManager powerManager = (PowerManager) getSystemService(POWER_SERVICE);
            if (powerManager == null) {
                return;
            }
            wakeLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "StreamHttp:streaming");
            wakeLock.setReferenceCounted(false);
        }
        if (!wakeLock.isHeld()) {
            wakeLock.acquire(WAKE_LOCK_TIMEOUT_MS);
        }
        handler.removeCallbacksAndMessages(null);
        handler.postDelayed(this::renewWakeLock, WAKE_LOCK_RENEWAL_MS);
    }

    private void renewWakeLock() {
        if (destroyed || StreamHttpStreamManager.getInstance().getActiveCount() == 0) {
            return;
        }
        if (wakeLock != null && wakeLock.isHeld()) {
            wakeLock.release();
        }
        acquireWakeLock();
    }

    private void releaseWakeLock() {
        if (wakeLock != null && wakeLock.isHeld()) {
            wakeLock.release();
        }
    }
}
