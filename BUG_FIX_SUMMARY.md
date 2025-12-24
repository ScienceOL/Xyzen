# Bug Fix: Celery Response Visibility Issue

## Problem
After introducing Celery for asynchronous chat processing, the frontend could see topic title renames but could not see AI chat responses.

## Root Cause
**Race Condition between Redis Subscription and Message Publishing**

The bug was caused by a timing issue in the WebSocket chat flow:

1. When a WebSocket connection is established, a `redis_listener` task is created to listen for messages from Celery workers
2. The listener subscribes to a Redis pub/sub channel **asynchronously**
3. User messages are processed immediately, even before the Redis subscription is fully established
4. Celery workers publish AI responses to Redis, but the messages are **lost** because the subscription isn't ready yet

### Why Title Updates Worked
Title renames used `ConnectionManager.send_personal_message()` which sends directly via WebSocket, bypassing Redis pub/sub entirely.

### Why Chat Responses Didn't Work
Chat responses go through this path:
- Celery worker → Redis pub/sub → redis_listener → WebSocket
- If the subscription isn't ready, messages published to Redis are lost

## Solution
Added synchronization to ensure Redis subscription is established before processing messages:

### Changes Made

1. **`service/app/api/ws/v1/chat.py`** - Updated `redis_listener` function:
   - Added `ready_event: asyncio.Event` parameter
   - Signal the event after successful subscription

2. **`service/app/api/ws/v1/chat.py`** - Updated `chat_websocket` handler:
   - Create an `asyncio.Event` to track subscription readiness
   - Wait for subscription to be ready (with 5-second timeout) before entering message loop
   - Handle timeout gracefully by closing WebSocket with appropriate error

3. **`service/tests/integration/test_async_chat.py`** - Updated test mock:
   - Updated mock signature to accept `ready_event` parameter
   - Signal ready immediately in mock to avoid blocking tests

## Code Changes

### Before (Race Condition)
```python
# Listener starts subscribing (async)
listener_task = asyncio.create_task(redis_listener(websocket, connection_id))

# Immediately start processing messages (BAD - subscription might not be ready!)
try:
    while True:
        data = await websocket.receive_json()
        # ... dispatch Celery task
```

### After (Synchronized)
```python
# Listener starts subscribing and signals when ready
redis_ready = asyncio.Event()
listener_task = asyncio.create_task(redis_listener(websocket, connection_id, redis_ready))

# Wait for subscription to be established
await asyncio.wait_for(redis_ready.wait(), timeout=5.0)

# NOW safe to process messages
try:
    while True:
        data = await websocket.receive_json()
        # ... dispatch Celery task
```

## Testing
To verify the fix works:
1. Run integration tests: `uv run pytest tests/integration/test_async_chat.py -v`
2. Manual test: Send a chat message and verify AI responses appear in the frontend

## Files Modified
- `service/app/api/ws/v1/chat.py` - Main fix
- `service/tests/integration/test_async_chat.py` - Test updates

## Impact
- **Low risk**: The change only adds a wait operation before processing messages
- **Backward compatible**: No API changes
- **Performance**: Adds negligible latency (~few milliseconds for subscription)
- **Reliability**: Eliminates race condition that caused message loss

## Prevention
Consider adding:
- Metrics to track Redis subscription latency
- Alerting if subscription timeout occurs frequently
- Integration tests that verify end-to-end message flow through Redis
