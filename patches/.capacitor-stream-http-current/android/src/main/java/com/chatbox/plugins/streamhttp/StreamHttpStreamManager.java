package com.chatbox.plugins.streamhttp;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;

import java.io.BufferedReader;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

/**
 * Owns native streaming work independently from a Capacitor Plugin instance.
 *
 * The plugin can be recreated while an Activity is in the background. Keeping
 * sessions here lets a new plugin instance replay data that was produced while
 * the WebView was paused.
 */
final class StreamHttpStreamManager {
    private static final int CONNECT_TIMEOUT_MS = 30_000;
    private static final int MAX_BUFFERED_BYTES_PER_STREAM = 8 * 1024 * 1024;
    private static final int MAX_REPLAY_BYTES = 512 * 1024;
    private static final int MAX_REPLAY_CHUNKS = 512;
    private static final int MAX_ERROR_BODY_BYTES = 64 * 1024;
    private static final int MAX_TERMINAL_SESSIONS = 32;
    private static final long TERMINAL_SESSION_TTL_MS = 15 * 60 * 1000L;

    private static final StreamHttpStreamManager INSTANCE = new StreamHttpStreamManager();

    static StreamHttpStreamManager getInstance() {
        return INSTANCE;
    }

    interface EventListener {
        void onEvent(StreamEvent event);
    }

    enum State {
        PENDING("pending"),
        RUNNING("running"),
        COMPLETED("completed"),
        FAILED("failed"),
        CANCELLED("cancelled"),
        MISSING("missing");

        private final String value;

        State(String value) {
            this.value = value;
        }

        String value() {
            return value;
        }

        boolean isActive() {
            return this == PENDING || this == RUNNING;
        }
    }

    static final class StreamRequest {
        final String url;
        final String method;
        final Map<String, String> headers;
        final String body;

        StreamRequest(String url, String method, Map<String, String> headers, String body) {
            this.url = url;
            this.method = method;
            this.headers = Collections.unmodifiableMap(new LinkedHashMap<>(headers));
            this.body = body;
        }
    }

    static final class StreamEvent {
        enum Type {
            CHUNK("chunk"),
            END("end"),
            ERROR("error");

            private final String eventName;

            Type(String eventName) {
                this.eventName = eventName;
            }

            String eventName() {
                return eventName;
            }
        }

        final Type type;
        final String id;
        final long sequence;
        final String chunk;
        final String error;
        final String errorBody;
        final boolean cancelled;
        final boolean cancelledByNotification;
        final int status;
        final Map<String, String> headers;

        StreamEvent(
            Type type,
            String id,
            long sequence,
            String chunk,
            String error,
            String errorBody,
            boolean cancelled,
            boolean cancelledByNotification,
            int status,
            Map<String, String> headers
        ) {
            this.type = type;
            this.id = id;
            this.sequence = sequence;
            this.chunk = chunk;
            this.error = error;
            this.errorBody = errorBody;
            this.cancelled = cancelled;
            this.cancelledByNotification = cancelledByNotification;
            this.status = status;
            this.headers = headers == null ? Collections.emptyMap() : Collections.unmodifiableMap(new LinkedHashMap<>(headers));
        }

        JSObject toJSObject() {
            JSObject result = new JSObject();
            result.put("id", id);
            result.put("sequence", sequence);
            if (chunk != null) {
                result.put("chunk", chunk);
            }
            if (error != null) {
                result.put("error", error);
            }
            if (errorBody != null) {
                result.put("errorBody", errorBody);
            }
            if (cancelled) {
                result.put("cancelled", true);
            }
            if (cancelledByNotification) {
                result.put("cancelledByNotification", true);
            }
            if (status > 0) {
                result.put("status", status);
            }
            if (!headers.isEmpty()) {
                result.put("headers", toHeadersObject(headers));
            }
            return result;
        }
    }

    static final class ReplayResult {
        final List<StreamEvent> chunks;
        final JSObject state;
        final boolean hasMore;

        ReplayResult(List<StreamEvent> chunks, JSObject state, boolean hasMore) {
            this.chunks = chunks;
            this.state = state;
            this.hasMore = hasMore;
        }

        JSObject toJSObject() {
            JSObject result = new JSObject();
            JSArray chunksArray = new JSArray();
            for (StreamEvent chunk : chunks) {
                chunksArray.put(chunk.toJSObject());
            }
            result.put("chunks", chunksArray);
            result.put("state", state);
            result.put("hasMore", hasMore);
            return result;
        }
    }

    private static final class StreamSession {
        final Object lock = new Object();
        final String id;
        StreamRequest request;
        final long createdAt = System.currentTimeMillis();
        final List<StreamEvent> bufferedChunks = new ArrayList<>();

        State state = State.PENDING;
        HttpURLConnection connection;
        Future<?> future;
        boolean cancellationRequested;
        boolean cancelledByNotification;
        boolean bufferTruncated;
        long lastSequence;
        int bufferedBytes;
        int status;
        Map<String, String> responseHeaders = Collections.emptyMap();
        String error;
        String errorBody;
        long completedAt;
        StreamEvent terminalEvent;

        StreamSession(String id, StreamRequest request) {
            this.id = id;
            this.request = request;
        }
    }

    private final Map<String, StreamSession> sessions = new ConcurrentHashMap<>();
    private final ExecutorService executor = Executors.newCachedThreadPool();
    private volatile EventListener eventListener;

    private StreamHttpStreamManager() {}

    String create(StreamRequest request) {
        trimTerminalSessions();
        String id = UUID.randomUUID().toString();
        sessions.put(id, new StreamSession(id, request));
        return id;
    }

    void setEventListener(EventListener listener) {
        eventListener = listener;
    }

    void clearEventListener(EventListener listener) {
        if (eventListener == listener) {
            eventListener = null;
        }
    }

    void start(String id) {
        StreamSession session = sessions.get(id);
        if (session == null) {
            return;
        }

        synchronized (session.lock) {
            if (session.state != State.PENDING) {
                return;
            }
            session.state = State.RUNNING;
        }

        Future<?> future = executor.submit(() -> execute(session));
        synchronized (session.lock) {
            session.future = future;
        }
        StreamHttpForegroundService.refresh();
    }

    void failToStart(String id) {
        StreamSession session = sessions.get(id);
        if (session != null) {
            finishFailed(session, "Unable to start the background streaming service", null);
        }
    }

    void cancel(String id) {
        cancel(id, false);
    }

    private void cancel(String id, boolean cancelledByNotification) {
        StreamSession session = sessions.get(id);
        if (session == null) {
            return;
        }

        HttpURLConnection connection;
        Future<?> future;
        synchronized (session.lock) {
            if (!session.state.isActive()) {
                return;
            }
            session.cancellationRequested = true;
            session.cancelledByNotification = session.cancelledByNotification || cancelledByNotification;
            connection = session.connection;
            future = session.future;
        }

        if (connection != null) {
            connection.disconnect();
        }
        if (future != null) {
            future.cancel(true);
        }
        finishCancelled(session);
    }

    void cancelAll() {
        for (String id : new ArrayList<>(sessions.keySet())) {
            cancel(id, true);
        }
    }

    int getActiveCount() {
        int count = 0;
        for (StreamSession session : sessions.values()) {
            synchronized (session.lock) {
                if (session.state.isActive()) {
                    count++;
                }
            }
        }
        return count;
    }

    JSObject attach(String id, long lastSequence) {
        StreamSession session = sessions.get(id);
        if (session == null) {
            return missingState(id);
        }
        synchronized (session.lock) {
            // Keep replay data until the session expires. The renderer can be
            // reclaimed after it has enqueued a chunk but before its message
            // storage write finishes, so delivery is not a durable checkpoint.
            return stateLocked(session, false);
        }
    }

    JSObject getState(String id) {
        StreamSession session = sessions.get(id);
        if (session == null) {
            return missingState(id);
        }
        synchronized (session.lock) {
            return stateLocked(session, false);
        }
    }

    ReplayResult replay(String id, long afterSequence) {
        StreamSession session = sessions.get(id);
        if (session == null) {
            return new ReplayResult(Collections.emptyList(), missingState(id), false);
        }

        synchronized (session.lock) {
            List<StreamEvent> replayed = new ArrayList<>();
            int replayBytes = 0;
            boolean hasMore = false;
            for (StreamEvent event : session.bufferedChunks) {
                if (event.sequence <= afterSequence) {
                    continue;
                }
                int eventBytes = byteLength(event.chunk);
                boolean exceedsChunkLimit = replayed.size() >= MAX_REPLAY_CHUNKS;
                boolean exceedsByteLimit = !replayed.isEmpty() && replayBytes + eventBytes > MAX_REPLAY_BYTES;
                if (exceedsChunkLimit || exceedsByteLimit) {
                    hasMore = true;
                    break;
                }
                replayed.add(event);
                replayBytes += eventBytes;
            }
            return new ReplayResult(replayed, stateLocked(session, hasMore), hasMore);
        }
    }

    void onServiceDestroyed() {
        if (getActiveCount() == 0) {
            return;
        }
        for (StreamSession session : sessions.values()) {
            synchronized (session.lock) {
                if (!session.state.isActive()) {
                    continue;
                }
            }
            finishFailed(session, "The background streaming service stopped", null);
        }
    }

    private void execute(StreamSession session) {
        HttpURLConnection connection = null;
        try {
            StreamRequest request;
            synchronized (session.lock) {
                request = session.request;
                if (request == null || session.cancellationRequested || !session.state.isActive()) {
                    return;
                }
            }

            URL url = new URL(request.url);
            String protocol = url.getProtocol();
            if (!"https".equalsIgnoreCase(protocol) && !"http".equalsIgnoreCase(protocol)) {
                throw new IOException("Unsupported URL scheme");
            }

            connection = (HttpURLConnection) url.openConnection();
            synchronized (session.lock) {
                if (session.cancellationRequested || !session.state.isActive()) {
                    return;
                }
                session.connection = connection;
            }

            configureConnection(connection, request);
            synchronized (session.lock) {
                // The connection is configured; terminal recovery never needs request credentials.
                session.request = null;
            }
            int responseCode = connection.getResponseCode();
            Map<String, String> responseHeaders = readResponseHeaders(connection);
            synchronized (session.lock) {
                session.status = responseCode;
                session.responseHeaders = responseHeaders;
            }

            if (responseCode < 200 || responseCode >= 300) {
                finishFailed(session, "HTTP " + responseCode, readErrorBody(connection.getErrorStream()));
                return;
            }

            InputStream inputStream = connection.getInputStream();
            if (inputStream != null) {
                readStream(session, inputStream);
            }

            if (isCancellationRequested(session)) {
                finishCancelled(session);
            } else {
                finishCompleted(session);
            }
        } catch (IOException exception) {
            if (isCancellationRequested(session)) {
                finishCancelled(session);
            } else {
                finishFailed(session, "Network request failed", null);
            }
        } catch (Exception exception) {
            if (isCancellationRequested(session)) {
                finishCancelled(session);
            } else {
                finishFailed(session, "Unable to process the streaming response", null);
            }
        } finally {
            if (connection != null) {
                connection.disconnect();
            }
            synchronized (session.lock) {
                if (session.connection == connection) {
                    session.connection = null;
                }
            }
            StreamHttpForegroundService.refresh();
        }
    }

    private void configureConnection(HttpURLConnection connection, StreamRequest request) throws IOException {
        connection.setRequestMethod(request.method);
        connection.setConnectTimeout(CONNECT_TIMEOUT_MS);
        // Streaming responses may legitimately pause for more than 30 seconds.
        connection.setReadTimeout(0);
        connection.setDoInput(true);

        for (Map.Entry<String, String> header : request.headers.entrySet()) {
            String name = header.getKey();
            String value = header.getValue();
            if (name == null || name.trim().isEmpty() || value == null || "content-length".equalsIgnoreCase(name)) {
                continue;
            }
            connection.setRequestProperty(name, value);
        }

        boolean mayHaveBody = request.body != null && !"GET".equalsIgnoreCase(request.method) && !"HEAD".equalsIgnoreCase(request.method);
        if (!mayHaveBody) {
            return;
        }

        byte[] payload = request.body.getBytes(StandardCharsets.UTF_8);
        connection.setDoOutput(true);
        connection.setFixedLengthStreamingMode(payload.length);
        try (OutputStream output = connection.getOutputStream()) {
            output.write(payload);
        }
    }

    private void readStream(StreamSession session, InputStream inputStream) throws IOException {
        try (
            BufferedReader reader = new BufferedReader(new InputStreamReader(inputStream, StandardCharsets.UTF_8))
        ) {
            SSEParser parser = new SSEParser();
            String line;
            while ((line = reader.readLine()) != null) {
                if (isCancellationRequested(session)) {
                    return;
                }
                String event = parser.processLine(line);
                if (event != null) {
                    emitChunk(session, event);
                }
            }

            String lastEvent = parser.processLine("");
            if (lastEvent != null) {
                emitChunk(session, lastEvent);
            }
            String remaining = parser.flush();
            if (remaining != null && !remaining.isEmpty()) {
                emitChunk(session, remaining);
            }
        }
    }

    private void emitChunk(StreamSession session, String chunk) {
        int start = 0;
        while (start < chunk.length()) {
            int end = nextChunkBoundary(chunk, start, MAX_REPLAY_BYTES);
            emitChunkPart(session, chunk.substring(start, end));
            start = end;
        }
    }

    /**
     * Keep every bridge event within the replay cap. Chunk boundaries are
     * transparent to the JavaScript ReadableStream, so splitting a large SSE
     * event cannot change the provider response seen by its parser.
     */
    private static int nextChunkBoundary(String value, int start, int maxBytes) {
        int index = start;
        int bytes = 0;
        while (index < value.length()) {
            int codePoint = value.codePointAt(index);
            int codePointBytes = codePoint <= 0x7F ? 1 : codePoint <= 0x7FF ? 2 : codePoint <= 0xFFFF ? 3 : 4;
            if (bytes > 0 && bytes + codePointBytes > maxBytes) {
                break;
            }
            bytes += codePointBytes;
            index += Character.charCount(codePoint);
        }
        // maxBytes is positive and every code point is at most four bytes.
        return index > start ? index : Math.min(value.length(), start + 1);
    }

    private void emitChunkPart(StreamSession session, String chunk) {
        StreamEvent event;
        synchronized (session.lock) {
            if (!session.state.isActive() || session.cancellationRequested) {
                return;
            }
            event = new StreamEvent(
                StreamEvent.Type.CHUNK,
                session.id,
                ++session.lastSequence,
                chunk,
                null,
                null,
                false,
                false,
                session.status,
                session.responseHeaders
            );
            bufferChunkLocked(session, event);
        }
        dispatch(event);
    }

    private void finishCompleted(StreamSession session) {
        finishTerminal(session, State.COMPLETED, StreamEvent.Type.END, null, null, false, false);
    }

    private void finishCancelled(StreamSession session) {
        boolean cancelledByNotification;
        synchronized (session.lock) {
            cancelledByNotification = session.cancelledByNotification;
        }
        finishTerminal(session, State.CANCELLED, StreamEvent.Type.END, null, null, true, cancelledByNotification);
    }

    private void finishFailed(StreamSession session, String error, String errorBody) {
        finishTerminal(session, State.FAILED, StreamEvent.Type.ERROR, error, errorBody, false, false);
    }

    private void finishTerminal(
        StreamSession session,
        State state,
        StreamEvent.Type eventType,
        String error,
        String errorBody,
        boolean cancelled,
        boolean cancelledByNotification
    ) {
        StreamEvent event;
        synchronized (session.lock) {
            if (!session.state.isActive()) {
                return;
            }
            session.state = state;
            session.error = error;
            session.errorBody = errorBody;
            session.request = null;
            session.completedAt = System.currentTimeMillis();
            event = new StreamEvent(
                eventType,
                session.id,
                ++session.lastSequence,
                null,
                error,
                errorBody,
                cancelled,
                cancelledByNotification,
                session.status,
                session.responseHeaders
            );
            session.terminalEvent = event;
        }
        dispatch(event);
        StreamHttpForegroundService.refresh();
    }

    private void bufferChunkLocked(StreamSession session, StreamEvent event) {
        int eventBytes = byteLength(event.chunk);
        while (!session.bufferedChunks.isEmpty() && session.bufferedBytes + eventBytes > MAX_BUFFERED_BYTES_PER_STREAM) {
            StreamEvent removed = session.bufferedChunks.remove(0);
            session.bufferedBytes -= byteLength(removed.chunk);
            session.bufferTruncated = true;
        }
        if (eventBytes > MAX_BUFFERED_BYTES_PER_STREAM) {
            session.bufferTruncated = true;
            return;
        }
        session.bufferedChunks.add(event);
        session.bufferedBytes += eventBytes;
    }

    private boolean isCancellationRequested(StreamSession session) {
        synchronized (session.lock) {
            return session.cancellationRequested || session.state == State.CANCELLED;
        }
    }

    private void dispatch(StreamEvent event) {
        EventListener listener = eventListener;
        if (listener != null) {
            try {
                listener.onEvent(event);
            } catch (RuntimeException ignored) {
                // The replay buffer remains the source of truth if the bridge is being recreated.
            }
        }
    }

    private JSObject stateLocked(StreamSession session, boolean hasMore) {
        JSObject result = new JSObject();
        result.put("id", session.id);
        result.put("state", session.state.value());
        result.put("lastSequence", session.lastSequence);
        if (session.status > 0) {
            result.put("status", session.status);
        }
        if (!session.responseHeaders.isEmpty()) {
            result.put("headers", toHeadersObject(session.responseHeaders));
        }
        if (session.error != null) {
            result.put("error", session.error);
        }
        if (session.errorBody != null) {
            result.put("errorBody", session.errorBody);
        }
        if (session.state == State.CANCELLED) {
            result.put("cancelled", true);
        }
        if (session.cancelledByNotification) {
            result.put("cancelledByNotification", true);
        }
        if (session.terminalEvent != null) {
            result.put("terminalSequence", session.terminalEvent.sequence);
        }
        if (!session.bufferedChunks.isEmpty()) {
            result.put("firstBufferedSequence", session.bufferedChunks.get(0).sequence);
        }
        if (session.bufferTruncated) {
            result.put("bufferTruncated", true);
        }
        if (hasMore) {
            result.put("hasMore", true);
        }
        return result;
    }

    private JSObject missingState(String id) {
        JSObject result = new JSObject();
        result.put("id", id);
        result.put("state", State.MISSING.value());
        result.put("lastSequence", 0);
        return result;
    }

    private static Map<String, String> readResponseHeaders(HttpURLConnection connection) {
        Map<String, String> headers = new LinkedHashMap<>();
        Map<String, List<String>> rawHeaders = connection.getHeaderFields();
        if (rawHeaders == null) {
            return headers;
        }
        for (Map.Entry<String, List<String>> entry : rawHeaders.entrySet()) {
            String name = entry.getKey();
            if (name == null || isSensitiveHeader(name)) {
                continue;
            }
            List<String> values = entry.getValue();
            if (values == null || values.isEmpty()) {
                continue;
            }
            headers.put(name, String.join(", ", values));
        }
        return headers;
    }

    private static boolean isSensitiveHeader(String name) {
        String normalized = name.toLowerCase(Locale.US);
        return "set-cookie".equals(normalized) || "authorization".equals(normalized) || "proxy-authorization".equals(normalized);
    }

    private static String readErrorBody(InputStream errorStream) {
        if (errorStream == null) {
            return null;
        }
        try (InputStream input = errorStream; ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[4096];
            int total = 0;
            int read;
            while ((read = input.read(buffer)) != -1 && total < MAX_ERROR_BODY_BYTES) {
                int length = Math.min(read, MAX_ERROR_BODY_BYTES - total);
                output.write(buffer, 0, length);
                total += length;
            }
            return output.toString(StandardCharsets.UTF_8.name());
        } catch (IOException ignored) {
            return null;
        }
    }

    private static int byteLength(String value) {
        return value == null ? 0 : value.getBytes(StandardCharsets.UTF_8).length;
    }

    private static JSObject toHeadersObject(Map<String, String> headers) {
        JSObject result = new JSObject();
        for (Map.Entry<String, String> header : headers.entrySet()) {
            result.put(header.getKey(), header.getValue());
        }
        return result;
    }

    private void trimTerminalSessions() {
        long now = System.currentTimeMillis();
        List<StreamSession> terminalSessions = new ArrayList<>();
        for (StreamSession session : sessions.values()) {
            synchronized (session.lock) {
                if (!session.state.isActive()) {
                    if (session.completedAt > 0 && now - session.completedAt > TERMINAL_SESSION_TTL_MS) {
                        sessions.remove(session.id, session);
                    } else {
                        terminalSessions.add(session);
                    }
                }
            }
        }
        if (terminalSessions.size() <= MAX_TERMINAL_SESSIONS) {
            return;
        }
        terminalSessions.sort((left, right) -> Long.compare(left.completedAt, right.completedAt));
        int removeCount = terminalSessions.size() - MAX_TERMINAL_SESSIONS;
        for (int index = 0; index < removeCount; index++) {
            StreamSession session = terminalSessions.get(index);
            sessions.remove(session.id, session);
        }
    }
}
