# """
# Streamed chat response logic for AI conversations.
# """

# import asyncio
# import json
# import logging
# from typing import Any, AsyncGenerator, Dict, List, Optional

# from sqlmodel.ext.asyncio.session import AsyncSession

# from core.providers import ChatCompletionRequest, ChatMessage, get_user_provider_manager
# from models.topic import Topic as TopicModel

# from .tools import _execute_tool_calls, _prepare_mcp_tools

# logger = logging.getLogger(__name__)


# async def get_ai_response_stream(
#     db: AsyncSession,
#     message_text: str,
#     topic: TopicModel,
#     user_id: str,
#     connection_manager: Optional[Any] = None,
#     connection_id: Optional[str] = None,
# ) -> AsyncGenerator[Dict[str, Any], None]:
#     """
#     Gets a streaming response from the AI model based on the message and chat history.
#     """
#     # --- Provider selection and prompt setup ---
#     try:
#         user_provider_manager = await get_user_provider_manager(user_id, db)
#     except ValueError as e:
#         logger.error(f"Failed to get provider manager for user {user_id}: {e}")
#         yield {"type": "error", "data": {"error": "No LLM providers configured. Please configure a provider first."}}
#         return

#     provider = None
#     if topic.session.agent and topic.session.agent.provider_id:
#         provider = user_provider_manager.get_provider(str(topic.session.agent.provider_id))
#         if provider:
#             logger.info(f"Using agent-specific provider: {topic.session.agent.provider_id}")
#         else:
#             logger.warning(
#                 f"Agent {topic.session.agent.id} has provider_id {topic.session.agent.provider_id} "
#                 f"but it's not available for user {user_id}. Falling back to default."
#             )
#     if not provider:
#         provider = user_provider_manager.get_active_provider()
#         logger.info(f"Using user's default provider for user {user_id}")
#     if not provider:
#         logger.error(f"No LLM provider available for user {user_id}")
#         yield {"type": "error", "data": {"error": "No AI provider is currently available."}}
#         return

#     system_prompt = """
# You are an advanced AI assistant designed to provide accurate, helpful, and contextually appropriate responses.

# ## Core Principles
# - Prioritize accuracy and factual correctness in all responses
# - Maintain a professional, courteous, and respectful tone
# - Provide clear, well-structured answers that directly address the user's query
# - Acknowledge uncertainty when appropriate rather than speculating

# ## Response Guidelines
# 1. **Clarity**: Use clear, concise language appropriate to the user's level of understanding
# 2. **Structure**: Organize information logically with proper formatting when beneficial
# 3. **Completeness**: Address all aspects of the user's question comprehensively
# 4. **Relevance**: Stay focused on the topic and avoid unnecessary tangents

# ## Technical Content
# - When discussing code or technical topics, use proper markdown formatting with code blocks (```)
# - Provide working, tested examples when applicable
# - Explain technical concepts in accessible terms while maintaining accuracy
# - Include relevant error handling and best practices in code examples

# ## Tool Usage
# - **Prioritize available MCP tools**: When tools are available that can help answer the user's question,
# use them proactively rather than relying on general knowledge
# - Verify information through tools when possible to ensure accuracy and currency
# - Clearly communicate when you're using tools to gather information
# - If tool execution fails, explain the issue and provide alternative approaches

# ## Security and Safety Constraints
# - **Never attempt to create web pages or HTML content within the current application context**
# - **Never generate code that could potentially compromise server security**, including but not limited to:
#   - Arbitrary code execution or eval() usage
#   - File system manipulation beyond authorized scope
#   - Network attacks or unauthorized access attempts
#   - Privilege escalation or authentication bypass
#   - Data exfiltration or unauthorized data access
#   - SQL injection or command injection vectors
#   - Cryptographic weaknesses or insecure implementations
# - **If a user request requires generating potentially harmful code,
# explicitly inform the user that the action has been blocked for security reasons** and explain why
# - Validate and sanitize all user inputs in generated code examples

# ## Limitations
# - Explicitly state when you don't have sufficient information to answer confidently
# - Recommend seeking expert advice for critical decisions (medical, legal, financial)
# - Be transparent about the boundaries of your knowledge and capabilities
# - Acknowledge when information may be outdated and suggest verification

# ## Ethical Considerations
# - Respect user privacy and data confidentiality
# - Decline requests that could cause harm or violate ethical guidelines
# - Promote inclusive and unbiased communication
# - Avoid generating content that is harmful, hateful, discriminatory, or illegal

# ## Error Handling
# - Provide constructive error messages when issues occur
# - Suggest actionable solutions or workarounds
# - Maintain composure and professionalism even when handling errors
# """
#     if topic.session.agent and topic.session.agent.prompt:
#         system_prompt = topic.session.agent.prompt

#     messages: List[ChatMessage] = [ChatMessage(role="system", content=system_prompt)]
#     for msg in topic.messages:
#         messages.append(ChatMessage(role=msg.role, content=msg.content))
#     messages.append(ChatMessage(role="user", content=message_text))

#     logger.info(f"Sending {len(messages)} messages to AI provider {provider.provider_name} for topic {topic.id}")

#     # Send initial event immediately to activate the generator and avoid blocking appearance
#     yield {"type": "processing", "data": {"status": "preparing_request"}}

#     try:
#         model = provider.model
#         logger.info(f"Using model: {model} with temperature: {provider.temperature}")
#         tools = await _prepare_mcp_tools(db, topic)
#         request = ChatCompletionRequest(
#             messages=messages,
#             model=model,
#             temperature=provider.temperature,
#             max_tokens=provider.max_tokens,
#             tools=tools if tools else None,
#             tool_choice="auto" if tools else None,
#         )

#         logger.info("Requesting AI response")
#         yield {"type": "processing", "data": {"status": "calling_ai"}}

#         # If there are no tools, use streaming directly for better responsiveness
#         if not tools and provider.supports_streaming():
#             logger.info("No tools - using pure streaming for better UX")
#             stream_id = f"stream_{int(asyncio.get_event_loop().time() * 1000)}"
#             yield {"type": "streaming_start", "data": {"id": stream_id}}
#             try:
#                 content_chunks = []
#                 async for chunk in provider.chat_completion_stream(request):
#                     if chunk.content:
#                         content_chunks.append(chunk.content)
#                         yield {"type": "streaming_chunk", "data": {"id": stream_id, "content": chunk.content}}
#                 full_content = "".join(content_chunks)
#                 if full_content:
#                     yield {
#                         "type": "streaming_end",
#                         "data": {
#                             "id": stream_id,
#                             "content": full_content,
#                             "created_at": asyncio.get_event_loop().time(),
#                         },
#                     }
#                 else:
#                     yield {"type": "error", "data": {"error": "Sorry, I could not generate a response."}}
#             except Exception as stream_error:
#                 logger.error(f"Streaming failed: {stream_error}")
#                 yield {"type": "error", "data": {"error": f"Streaming error: {stream_error}"}}
#             return

#         # For tool-enabled scenarios, we need to get the complete response first
#         # to check for tool calls (unfortunately this requires waiting)
#         response = await provider.chat_completion(request)
#         message_id = f"msg_{int(asyncio.get_event_loop().time() * 1000)}"

#         # --- Tool call handling ---
#         if response.tool_calls and len(response.tool_calls) > 0:
#             logger.info(f"AI requested {len(response.tool_calls)} tool call(s)")
#             for i, tool_call in enumerate(response.tool_calls):
#                 tool_name = tool_call.get("function", {}).get("name", "unknown")
#                 logger.info(f"Tool call {i+1}: {tool_name}")
#             require_confirmation = (
#                 topic.session.agent
#                 and hasattr(topic.session.agent, "require_tool_confirmation")
#                 and topic.session.agent.require_tool_confirmation
#             )
#             logger.info(f"Tool confirmation required: {require_confirmation}")
#             if require_confirmation and connection_manager and connection_id:
#                 logger.info("Sending tool calls for user confirmation")
#                 for tool_call in response.tool_calls:
#                     tool_call_id = tool_call.get("id", f"tool_{int(asyncio.get_event_loop().time() * 1000)}")
#                     connection_manager.pending_tool_calls[tool_call_id] = {
#                         "connection_id": connection_id,
#                         "tool_calls": response.tool_calls,
#                         "topic": topic,
#                         "messages": messages,
#                         "provider": provider,
#                         "message_id": message_id,
#                         "model": model,
#                     }
#                     tool_call_event = {
#                         "type": "tool_call_request",
#                         "data": {
#                             "id": tool_call_id,
#                             "name": tool_call.get("function", {}).get("name", ""),
#                             "description": f"Tool: {tool_call.get('function', {}).get('name', '')}",
#                             "arguments": json.loads(tool_call.get("function", {}).get("arguments", "{}")),
#                             "status": "waiting_confirmation",
#                             "timestamp": asyncio.get_event_loop().time(),
#                         },
#                     }
#                     logger.info(f"Sending tool call event: {tool_call_event}")
#                     yield tool_call_event
#                 return
#             else:
#                 logger.info("Sending tool calls and executing immediately without confirmation")
#                 for tool_call in response.tool_calls:
#                     tool_call_event = {
#                         "type": "tool_call_request",
#                         "data": {
#                             "id": tool_call.get("id", f"tool_{int(asyncio.get_event_loop().time() * 1000)}"),
#                             "name": tool_call.get("function", {}).get("name", ""),
#                             "description": f"Tool: {tool_call.get('function', {}).get('name', '')}",
#                             "arguments": json.loads(tool_call.get("function", {}).get("arguments", "{}")),
#                             "status": "executing",
#                             "timestamp": asyncio.get_event_loop().time(),
#                         },
#                     }
#                     logger.info(f"Sending tool call event (immediate execution): {tool_call_event}")
#                     yield tool_call_event
#                 try:
#                     tool_results = await _execute_tool_calls(db, response.tool_calls, topic)
#                     for tool_call in response.tool_calls:
#                         tool_call_id = tool_call.get("id", f"tool_{int(asyncio.get_event_loop().time() * 1000)}")
#                         result = tool_results.get(tool_call_id)
#                         if result:
#                             completion_event = {
#                                 "type": "tool_call_response",
#                                 "data": {
#                                     "toolCallId": tool_call_id,
#                                     "status": "completed",
#                                     "result": result,
#                                 },
#                             }
#                             logger.info(f"Sending tool completion event: {completion_event}")
#                             yield completion_event
#                     logger.info("Tool execution completed, sending loading event for AI response")
#                     yield {"type": "loading", "data": {}}
#                     assistant_tool_message = ChatMessage(
#                         role="assistant", content=f"I need to use tools to help answer your question."
#                     )
#                     tool_result_messages = []
#                     for tool_call_id, result in tool_results.items():
#                         # ...existing code for result_content extraction...
#                         if isinstance(result, dict):
#                             if "content" in result:
#                                 content = result["content"]
#                                 if isinstance(content, str) and content.startswith("[TextContent"):
#                                     try:
#                                         import re

#                                         match = re.search(r"text='([^']*)'", content)
#                                         if match:
#                                             result_content = match.group(1)
#                                         else:
#                                             result_content = str(result)
#                                     except Exception:
#                                         result_content = str(result)
#                                 else:
#                                     result_content = str(content)
#                             else:
#                                 result_content = str(result)
#                         else:
#                             result_content = str(result)
#                         logger.info(f"Processed tool result for AI: {result_content}")
#                         tool_result_messages.append(
#                             ChatMessage(role="user", content=f"Tool execution result: {result_content}")
#                         )
#                     final_messages = messages + [assistant_tool_message] + tool_result_messages
#                     final_request = ChatCompletionRequest(
#                         messages=final_messages,
#                         model=model,
#                         temperature=provider.temperature,
#                         max_tokens=provider.max_tokens,
#                     )
#                     if provider.supports_streaming():
#                         logger.info("Using streaming for final AI response after tool execution")
#                         final_message_id = f"final_stream_{int(asyncio.get_event_loop().time() * 1000)}"
#                         yield {"type": "streaming_start", "data": {"id": final_message_id}}
#                         final_content_chunks = []
#                         async for chunk in provider.chat_completion_stream(final_request):
#                             if chunk.content:
#                                 final_content_chunks.append(chunk.content)
#                                 yield {
#                                     "type": "streaming_chunk",
#                                     "data": {"id": final_message_id, "content": chunk.content},
#                                 }
#                         final_full_content = "".join(final_content_chunks)
#                         if final_full_content.strip():
#                             yield {
#                                 "type": "streaming_end",
#                                 "data": {
#                                     "id": final_message_id,
#                                     "content": final_full_content,
#                                     "created_at": asyncio.get_event_loop().time(),
#                                 },
#                             }
#                         else:
#                             logger.warning("Final AI streaming response after tool execution was empty")
#                     else:
#                         final_response = await provider.chat_completion(final_request)
#                         if final_response.content:
#                             yield {
#                                 "type": "message",
#                                 "data": {
#                                     "id": message_id,
#                                     "role": "assistant",
#                                     "content": final_response.content,
#                                     "created_at": asyncio.get_event_loop().time(),
#                                 },
#                             }
#                         else:
#                             logger.warning("Final AI response after tool execution was empty")
#                     return
#                 except Exception as e:
#                     logger.error(f"Error executing tools immediately: {e}")
#                     for tool_call in response.tool_calls:
#                         tool_call_id = tool_call.get("id", f"tool_{int(asyncio.get_event_loop().time() * 1000)}")
#                         error_event = {
#                             "type": "tool_call_response",
#                             "data": {
#                                 "toolCallId": tool_call_id,
#                                 "status": "failed",
#                                 "error": str(e),
#                             },
#                         }
#                         yield error_event
#                     return

#         # --- Response with tools enabled but no tool calls were made ---
#         # At this point, we have a response but it didn't trigger tool calls
#         if response.content:
#             # Since we already have the full response (we had to wait for it to check for tool calls),
#             # we can either stream it or send it directly
#             if provider.supports_streaming():
#                 logger.info("Got response with tools enabled but no tool calls - streaming to client")
#                 stream_id = f"stream_{int(asyncio.get_event_loop().time() * 1000)}"
#                 yield {"type": "streaming_start", "data": {"id": stream_id}}

#                 # We already have the full response, but let's stream it for consistency
#                 # Simulate streaming by chunking the response
#                 chunk_size = 50  # Characters per chunk
#                 for i in range(0, len(response.content), chunk_size):
#                     chunk_text = response.content[i : i + chunk_size]  # noqa: E203
#                     yield {"type": "streaming_chunk", "data": {"id": stream_id, "content": chunk_text}}
#                     # Small delay to simulate streaming
#                     await asyncio.sleep(0.01)

#                 yield {
#                     "type": "streaming_end",
#                     "data": {
#                         "id": stream_id,
#                         "content": response.content,
#                         "created_at": asyncio.get_event_loop().time(),
#                     },
#                 }
#             else:
#                 logger.info("Provider doesn't support streaming, sending complete response")
#                 yield {
#                     "type": "message",
#                     "data": {
#                         "id": message_id,
#                         "role": "assistant",
#                         "content": response.content,
#                         "created_at": asyncio.get_event_loop().time(),
#                     },
#                 }
#         else:
#             yield {"type": "error", "data": {"error": "Sorry, I could not generate a response."}}
#     except Exception as e:
#         logger.error(f"Failed to call AI provider {provider.provider_name} for topic {topic.id}: {e}")
#         yield {"type": "error", "data": {"error": f"Sorry, the AI service is currently unavailable. Error: {e}"}}
