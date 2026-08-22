package com.chatbox.plugins.streamhttp;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Capacitor bridge for StreamHttpForegroundService.
 *
 * The plugin deliberately does not own active HTTP connections. Capacitor can
 * destroy and recreate a Plugin with its Activity, while the foreground service
 * must continue running and make buffered chunks available to the new bridge.
 */
@CapacitorPlugin(name = "StreamHttp")
public class StreamHttpPlugin extends Plugin {
    private final StreamHttpStreamManager streamManager = StreamHttpStreamManager.getInstance();
    private StreamHttpStreamManager.EventListener eventListener;

    @Override
    public void load() {
        eventListener = event -> notifyListeners(event.type.eventName(), event.toJSObject());
        streamManager.setEventListener(eventListener);
    }

    @PluginMethod
    public void startStream(PluginCall call) {
        String url = call.getString("url");
        if (url == null || url.trim().isEmpty()) {
            call.reject("URL is required");
            return;
        }

        String method = call.getString("method", "GET");
        JSObject headers = call.getObject("headers", new JSObject());
        String body = call.getString("body");
        String streamId = streamManager.create(new StreamHttpStreamManager.StreamRequest(url, method, headersToMap(headers), body));

        try {
            StreamHttpForegroundService.start(getContext().getApplicationContext(), streamId);
        } catch (RuntimeException exception) {
            streamManager.failToStart(streamId);
            call.reject("Unable to start the background streaming service");
            return;
        }

        JSObject result = new JSObject();
        result.put("id", streamId);
        call.resolve(result);
    }

    @PluginMethod
    public void cancelStream(PluginCall call) {
        String streamId = call.getString("id");
        if (streamId == null || streamId.trim().isEmpty()) {
            call.reject("Stream ID is required");
            return;
        }
        streamManager.cancel(streamId);
        call.resolve();
    }

    /** Returns the current task state before replaying missed data in batches. */
    @PluginMethod
    public void attachStream(PluginCall call) {
        String streamId = call.getString("id");
        if (streamId == null || streamId.trim().isEmpty()) {
            call.reject("Stream ID is required");
            return;
        }
        call.resolve(streamManager.attach(streamId, sequenceOption(call, "lastSequence")));
    }

    @PluginMethod
    public void getStreamState(PluginCall call) {
        String streamId = call.getString("id");
        if (streamId == null || streamId.trim().isEmpty()) {
            call.reject("Stream ID is required");
            return;
        }
        call.resolve(streamManager.getState(streamId));
    }

    /**
     * Returns chunks emitted after afterSequence. Batches are capped so a large
     * response cannot exceed Android bridge message limits.
     */
    @PluginMethod
    public void replayChunks(PluginCall call) {
        String streamId = call.getString("id");
        if (streamId == null || streamId.trim().isEmpty()) {
            call.reject("Stream ID is required");
            return;
        }
        call.resolve(streamManager.replay(streamId, sequenceOption(call, "afterSequence")).toJSObject());
    }

    @Override
    protected void handleOnDestroy() {
        if (eventListener != null) {
            streamManager.clearEventListener(eventListener);
            eventListener = null;
        }
        super.handleOnDestroy();
    }

    private static Map<String, String> headersToMap(JSObject headers) {
        Map<String, String> result = new LinkedHashMap<>();
        Iterator<String> keys = headers.keys();
        while (keys.hasNext()) {
            String key = keys.next();
            String value = headers.optString(key, null);
            if (value != null) {
                result.put(key, value);
            }
        }
        return result;
    }

    private static long sequenceOption(PluginCall call, String name) {
        Object value = call.getData().opt(name);
        return value instanceof Number ? Math.max(0L, ((Number) value).longValue()) : 0L;
    }
}
