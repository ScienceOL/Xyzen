#!/usr/bin/env python3
"""
Verification script to test Redis pub/sub timing.
This simulates the race condition that was causing the bug.
"""

import asyncio
import redis.asyncio as redis


async def test_race_condition_before_fix():
    """
    Simulates the bug: publisher starts before subscriber is ready.
    Messages are lost!
    """
    print("\n=== Testing BEFORE fix (race condition) ===")
    received_messages = []
    
    async def subscriber_without_sync():
        """Subscriber that doesn't signal when ready"""
        r = redis.from_url("redis://localhost:6379/0", decode_responses=True)
        pubsub = r.pubsub()
        await pubsub.subscribe("test:channel:before")
        print("Subscriber: subscribed")
        
        # Simulate the delay in subscription setup
        await asyncio.sleep(0.1)
        
        async for message in pubsub.listen():
            if message["type"] == "message":
                received_messages.append(message["data"])
                print(f"Subscriber: received '{message['data']}'")
                if message["data"] == "DONE":
                    break
        
        await pubsub.unsubscribe("test:channel:before")
        await r.close()
    
    async def publisher():
        """Publisher that sends immediately"""
        r = redis.from_url("redis://localhost:6379/0", decode_responses=True)
        print("Publisher: starting immediately (no wait)")
        
        # Send messages right away (BAD - subscriber not ready!)
        for i in range(3):
            await r.publish("test:channel:before", f"Message {i}")
            print(f"Publisher: sent 'Message {i}'")
        
        await r.publish("test:channel:before", "DONE")
        await r.close()
    
    # Start subscriber and publisher concurrently (race condition!)
    subscriber_task = asyncio.create_task(subscriber_without_sync())
    await asyncio.sleep(0.01)  # Tiny delay
    publisher_task = asyncio.create_task(publisher())
    
    await asyncio.gather(subscriber_task, publisher_task)
    
    print(f"\nResult: Received {len(received_messages)} messages (expected 4)")
    if len(received_messages) < 4:
        print("❌ BUG: Messages were lost due to race condition!")
    else:
        print("✓ All messages received")
    
    return received_messages


async def test_with_fix():
    """
    Tests with the fix: subscriber signals when ready, publisher waits.
    All messages received!
    """
    print("\n\n=== Testing AFTER fix (synchronized) ===")
    received_messages = []
    
    async def subscriber_with_sync(ready_event: asyncio.Event):
        """Subscriber that signals when ready"""
        r = redis.from_url("redis://localhost:6379/0", decode_responses=True)
        pubsub = r.pubsub()
        await pubsub.subscribe("test:channel:after")
        print("Subscriber: subscribed")
        
        # Signal that we're ready!
        ready_event.set()
        print("Subscriber: signaled ready")
        
        async for message in pubsub.listen():
            if message["type"] == "message":
                received_messages.append(message["data"])
                print(f"Subscriber: received '{message['data']}'")
                if message["data"] == "DONE":
                    break
        
        await pubsub.unsubscribe("test:channel:after")
        await r.close()
    
    async def publisher(ready_event: asyncio.Event):
        """Publisher that waits for subscriber to be ready"""
        await ready_event.wait()
        print("Publisher: subscriber is ready, starting to publish")
        
        r = redis.from_url("redis://localhost:6379/0", decode_responses=True)
        
        # Send messages (GOOD - subscriber is ready!)
        for i in range(3):
            await r.publish("test:channel:after", f"Message {i}")
            print(f"Publisher: sent 'Message {i}'")
        
        await r.publish("test:channel:after", "DONE")
        await r.close()
    
    # Start subscriber and wait for it to be ready
    ready_event = asyncio.Event()
    subscriber_task = asyncio.create_task(subscriber_with_sync(ready_event))
    
    # Wait for subscriber to be ready
    await asyncio.wait_for(ready_event.wait(), timeout=5.0)
    print("Main: subscriber is ready, starting publisher")
    
    # Now start publisher
    publisher_task = asyncio.create_task(publisher(ready_event))
    
    await asyncio.gather(subscriber_task, publisher_task)
    
    print(f"\nResult: Received {len(received_messages)} messages (expected 4)")
    if len(received_messages) == 4:
        print("✅ FIX WORKS: All messages received!")
    else:
        print("❌ Messages still lost")
    
    return received_messages


async def main():
    """Run both tests to demonstrate the bug and fix"""
    print("=" * 60)
    print("Redis Pub/Sub Race Condition Demonstration")
    print("=" * 60)
    
    try:
        # Test the buggy version
        messages_before = await test_race_condition_before_fix()
        
        # Test the fixed version
        messages_after = await test_with_fix()
        
        # Summary
        print("\n" + "=" * 60)
        print("SUMMARY")
        print("=" * 60)
        print(f"Before fix: {len(messages_before)}/4 messages received")
        print(f"After fix:  {len(messages_after)}/4 messages received")
        print()
        print("This demonstrates why the frontend couldn't see chat responses!")
        print("The fix ensures Redis subscription is ready before publishing.")
        
    except redis.ConnectionError:
        print("\n❌ ERROR: Could not connect to Redis")
        print("Make sure Redis is running: docker-compose up redis")
        print("\nTo test manually:")
        print("1. Start Redis: docker-compose -f docker/docker-compose.dev.yaml up redis")
        print("2. Run this script: python3 verify_redis_fix.py")


if __name__ == "__main__":
    asyncio.run(main())
