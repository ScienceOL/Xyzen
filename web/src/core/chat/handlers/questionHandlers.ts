/**
 * Question Event Handlers
 *
 * Handles ask_user_question events from the backend.
 */

import type { ChatChannel } from "@/store/types";
import type { UserQuestion } from "@/store/types";
import { generateClientId } from "../messageProcessor";
import {
  findMessageIndexByStream,
  findRunningAgentMessageIndex,
} from "../channelHelpers";

/**
 * Build a UserQuestion object from backend event data.
 */
function buildUserQuestion(eventData: AskUserQuestionEvent): UserQuestion {
  return {
    questionId: eventData.question_id,
    question: eventData.question,
    options: eventData.options?.map((o) => ({
      id: o.id,
      label: o.label,
      description: o.description,
      markdown: o.markdown,
    })),
    multiSelect: eventData.multi_select ?? false,
    allowTextInput: eventData.allow_text_input,
    timeoutSeconds: eventData.timeout_seconds,
    threadId: eventData.thread_id,
    status: "pending",
    askedAt: Date.now(),
  };
}

interface AskUserQuestionEvent {
  question_id: string;
  question: string;
  options?: Array<{
    id: string;
    label: string;
    description?: string;
    markdown?: string;
  }>;
  multi_select?: boolean;
  allow_text_input: boolean;
  timeout_seconds: number;
  stream_id: string;
  thread_id: string;
}

/**
 * Handle ask_user_question event.
 *
 * Finds the target message (by stream_id, running agent message, or last
 * assistant message) and attaches the question data.
 *
 * For sequential questions the agent may call ask_user_question again on
 * resume without producing any streaming text, so the stream_id from the
 * resume task won't match any message. The final fallback covers this by
 * finding the most recent assistant message (which already carried Q1).
 *
 * If the target message already has an answered question, a NEW assistant
 * message is appended so both Q1 and Q2 are visible in the chat.
 */
export function handleAskUserQuestion(
  channel: ChatChannel,
  eventData: AskUserQuestionEvent,
): void {
  // Find target message by stream_id
  let targetIndex = findMessageIndexByStream(channel, eventData.stream_id);

  // Fallback: find the currently running agent message
  if (targetIndex === -1) {
    targetIndex = findRunningAgentMessageIndex(channel);
  }

  // Fallback: most recent assistant message (handles sequential questions
  // where the resume produced no streaming content so the stream_id didn't
  // get associated with any message)
  if (targetIndex === -1) {
    for (let i = channel.messages.length - 1; i >= 0; i--) {
      if (channel.messages[i].role === "assistant") {
        targetIndex = i;
        break;
      }
    }
  }

  if (targetIndex === -1) {
    console.warn(
      "[questionHandlers] No target message found for ask_user_question event",
    );
    return;
  }

  const msg = channel.messages[targetIndex];
  const userQuestion = buildUserQuestion(eventData);

  // Sequential question: the message already has an answered question.
  // Finalize the old message and create a new assistant message so both
  // questions are visible.
  if (msg.userQuestion && msg.userQuestion.status !== "pending") {
    msg.status = "completed";
    msg.isStreaming = false;
    delete msg.isLoading;

    channel.messages.push({
      id: eventData.stream_id,
      streamId: eventData.stream_id,
      clientId: generateClientId(),
      role: "assistant" as const,
      content: "",
      created_at: new Date().toISOString(),
      status: "waiting_for_user",
      isStreaming: false,
      userQuestion,
    });
    channel.responding = true;
    return;
  }

  // First question on this message — update in place
  msg.status = "waiting_for_user";
  msg.isStreaming = false;
  msg.userQuestion = userQuestion;

  // Keep channel in responding state so the input stays disabled
  channel.responding = true;
}
