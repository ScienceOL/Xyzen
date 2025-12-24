# Testing Guide for Celery Response Visibility Fix

## Quick Summary
**Bug**: Frontend could see title renames but not AI chat responses after Celery was introduced.
**Cause**: Race condition - messages published to Redis before subscription was ready.
**Fix**: Synchronize Redis subscription before processing messages.

## Files Changed
1. `service/app/api/ws/v1/chat.py` - Main fix
2. `service/tests/integration/test_async_chat.py` - Test updates
3. `BUG_FIX_SUMMARY.md` - Detailed explanation
4. `verify_redis_fix.py` - Verification script

## Testing the Fix

### 1. Unit/Integration Tests
```bash
cd service
uv run pytest tests/integration/test_async_chat.py -v
```

Expected output:
```
test_chat_websocket_dispatches_celery_task PASSED
test_chat_websocket_saves_user_message PASSED
```

### 2. Manual Frontend Testing
1. Start the development environment:
   ```bash
   ./launch/dev.sh
   ```

2. Open the web interface and create a new chat session

3. Send a message to the AI

4. Verify you can see:
   - ✅ Your message appears immediately
   - ✅ "AI is thinking..." loading indicator
   - ✅ **AI response streams in** (this was broken before!)
   - ✅ Topic title updates (this always worked)

### 3. Redis Pub/Sub Verification (Optional)
If you want to understand the race condition better:

```bash
# Make sure Redis is running
docker-compose -f docker/docker-compose.dev.yaml up redis

# Run the verification script
python3 verify_redis_fix.py
```

This will demonstrate:
- **Before fix**: Messages lost due to race condition
- **After fix**: All messages received correctly

### 4. Monitoring Redis Activity
You can monitor Redis pub/sub in real-time:

```bash
# Terminal 1: Monitor Redis pub/sub
docker exec -it xyzen-redis redis-cli
> PSUBSCRIBE chat:*

# Terminal 2: Send a chat message via the web interface

# You should see messages being published to channels like:
# chat:550e8400-e29b-41d4-a716-446655440000:660e8400-e29b-41d4-a716-446655440001
```

## Expected Behavior After Fix

### WebSocket Connection Flow
1. Client connects to WebSocket endpoint
2. Server validates session/topic access
3. **Server creates Redis listener and waits for subscription** (NEW)
4. Server enters message processing loop
5. Client sends messages
6. Server dispatches Celery task
7. Celery worker publishes responses to Redis
8. Redis listener receives and forwards to WebSocket
9. Client sees AI responses ✅

### What to Check
- [ ] Frontend receives AI responses in real-time
- [ ] No "hanging" or timeout errors
- [ ] Topic titles still update correctly
- [ ] Tool calls are visible (if using tools)
- [ ] Citations appear (if using search)
- [ ] No Redis connection errors in logs

## Troubleshooting

### If responses still don't appear:

1. **Check Redis is running**:
   ```bash
   docker ps | grep redis
   ```

2. **Check Celery worker is running**:
   ```bash
   docker ps | grep worker
   # Or check logs:
   docker logs xyzen-worker
   ```

3. **Check for Redis subscription timeout**:
   ```bash
   docker logs xyzen-api | grep "Redis subscription timeout"
   ```
   If you see this, Redis might be overloaded or unreachable.

4. **Check for task dispatch**:
   ```bash
   docker logs xyzen-api | grep "Starting async chat processing"
   ```

5. **Check Redis pub/sub channels**:
   ```bash
   docker exec -it xyzen-redis redis-cli
   > PUBSUB CHANNELS chat:*
   ```

### Common Issues

**Issue**: WebSocket closes with "Failed to establish Redis connection"
- **Cause**: Redis is not accessible or taking too long to connect
- **Solution**: Check Redis container health, network connectivity

**Issue**: Still no responses after fix
- **Cause**: Celery worker might not be running or has errors
- **Solution**: Check `docker logs xyzen-worker` for errors

**Issue**: Intermittent message loss
- **Cause**: Redis subscription timeout (5 seconds) might be too short
- **Solution**: Increase timeout in `chat.py` line 127: `timeout=10.0`

## Performance Impact

The fix adds minimal latency:
- **Subscription time**: ~10-50ms (typical)
- **Timeout**: 5000ms (max, if Redis is down)
- **Normal operation**: No noticeable impact

## Rollback Instructions

If you need to rollback this change:

```bash
git revert HEAD
# Or restore previous version:
git checkout HEAD~1 service/app/api/ws/v1/chat.py
git checkout HEAD~1 service/tests/integration/test_async_chat.py
```

Note: Rolling back will restore the race condition bug.

## Additional Monitoring

Consider adding these metrics:
- Redis subscription latency
- Rate of subscription timeouts
- Message delivery success rate
- WebSocket connection duration

## Questions?

If you encounter any issues or have questions about the fix:
1. Check `BUG_FIX_SUMMARY.md` for detailed explanation
2. Review the git diff: `git diff service/app/api/ws/v1/chat.py`
3. Check application logs for errors
