/**
 * Session creation utilities
 *
 * This module handles the logic for creating new sessions and topics,
 * extracted from chatSlice.ts for better separation of concerns.
 */

import { authService } from "@/service/authService";
import { sessionService } from "@/service/sessionService";
import { providerCore } from "@/core/provider";
import type {
  SessionResponse,
  TopicResponse,
  SessionCreatePayload,
  SessionCreationResult,
  AgentSessionInfo,
  ProviderInfo,
} from "./types";
import type { ChatChannel, ChatHistoryItem } from "@/store/types";

/**
 * Create a ChatChannel object from session and topic data
 */
export function createChannelFromSession(
  session: SessionResponse,
  topic: TopicResponse,
): ChatChannel {
  return {
    id: topic.id,
    sessionId: session.id,
    title: topic.name,
    messages: [],
    agentId: session.agent_id,
    provider_id: session.provider_id,
    model: session.model,
    knowledge_set_id: session.knowledge_set_id,
    connected: false,
    error: null,
  };
}

/**
 * Create a ChatHistoryItem from session and topic data
 */
export function createHistoryItemFromSession(
  session: SessionResponse,
  topic: TopicResponse,
  agentName?: string,
): ChatHistoryItem {
  return {
    id: topic.id,
    sessionId: session.id,
    title: topic.name,
    updatedAt: topic.updated_at,
    assistantTitle: agentName || "Assistant",
    lastMessage: "",
    isPinned: false,
  };
}

/**
 * Resolve provider and model for session creation
 *
 * Priority:
 * 1. Agent's configured provider/model
 * 2. System default provider/model
 */
export async function resolveProviderAndModel(
  agent: AgentSessionInfo | null,
  providers: ProviderInfo[],
): Promise<{ providerId: string | null; model: string | null }> {
  // Try agent's configured provider/model first
  if (agent?.provider_id && agent?.model) {
    return {
      providerId: agent.provider_id,
      model: agent.model,
    };
  }

  // Fall back to system defaults
  try {
    return await providerCore.getDefaultProviderAndModel(providers);
  } catch (error) {
    console.error("Failed to get default provider/model:", error);
    return { providerId: null, model: null };
  }
}

/**
 * Build session creation payload
 */
export function buildSessionPayload(
  agent: AgentSessionInfo | null,
  providerId: string | null,
  model: string | null,
): SessionCreatePayload {
  const payload: SessionCreatePayload = {
    name: "New Session",
    agent_id: agent?.id,
  };

  if (providerId) {
    payload.provider_id = providerId;
  }

  if (model) {
    payload.model = model;
  }

  // Include MCP server IDs if agent has them
  if (agent?.mcp_servers?.length) {
    payload.mcp_server_ids = agent.mcp_servers.map((s) => s.id);
  }

  return payload;
}

/**
 * Create a new topic in an existing session
 */
export async function createTopicInSession(
  backendUrl: string,
  sessionId: string,
  name: string = "新的聊天",
): Promise<TopicResponse> {
  const token = authService.getToken();
  if (!token) {
    throw new Error("No authentication token available");
  }

  const response = await fetch(`${backendUrl}/xyzen/api/v1/topics/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      name,
      session_id: sessionId,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to create topic: ${response.status} ${errorText}`);
  }

  return response.json();
}

/**
 * Create a new session with a default topic
 */
export async function createNewSession(
  backendUrl: string,
  payload: SessionCreatePayload,
): Promise<SessionResponse> {
  const token = authService.getToken();
  if (!token) {
    throw new Error("No authentication token available");
  }

  const response = await fetch(`${backendUrl}/xyzen/api/v1/sessions/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to create session: ${response.status} ${errorText}`,
    );
  }

  return response.json();
}

/**
 * Find existing session for agent or create new one
 *
 * @param backendUrl - Backend API URL
 * @param agentId - Agent ID to find/create session for
 * @param agent - Agent data for session creation
 * @param providers - Available LLM providers
 * @param getAgentName - Function to get agent display name
 * @returns Session creation result
 */
export async function findOrCreateSession(
  backendUrl: string,
  agentId: string | undefined,
  agent: AgentSessionInfo | null,
  providers: ProviderInfo[],
  getAgentName: (agentId: string) => string,
): Promise<SessionCreationResult> {
  const agentIdParam = agentId || "default";

  // Try to find existing session for this agent
  const existingSession = await tryFindExistingSession(
    backendUrl,
    agentIdParam,
  );

  if (existingSession) {
    // Update session with provider/model if missing
    const updatedSession = await ensureSessionHasProvider(
      existingSession,
      agent,
      providers,
    );

    // Create new topic in existing session
    const newTopic = await createTopicInSession(
      backendUrl,
      updatedSession.id,
      "新的聊天",
    );

    return {
      channel: createChannelFromSession(updatedSession, newTopic),
      historyItem: createHistoryItemFromSession(
        updatedSession,
        newTopic,
        getAgentName(updatedSession.agent_id),
      ),
      sessionId: updatedSession.id,
      topicId: newTopic.id,
    };
  }

  // Create new session
  const { providerId, model } = await resolveProviderAndModel(agent, providers);
  const payload = buildSessionPayload(agent, providerId, model);
  const newSession = await createNewSession(backendUrl, payload);

  // Get or create topic
  let topic: TopicResponse;
  if (newSession.topics && newSession.topics.length > 0) {
    topic = newSession.topics[0];
  } else {
    topic = await createTopicInSession(backendUrl, newSession.id, "新的聊天");
  }

  return {
    channel: createChannelFromSession(newSession, topic),
    historyItem: createHistoryItemFromSession(
      newSession,
      topic,
      getAgentName(newSession.agent_id),
    ),
    sessionId: newSession.id,
    topicId: topic.id,
  };
}

/**
 * Try to find an existing session for an agent
 */
async function tryFindExistingSession(
  backendUrl: string,
  agentId: string,
): Promise<SessionResponse | null> {
  const token = authService.getToken();
  if (!token) {
    return null;
  }

  try {
    const response = await fetch(
      `${backendUrl}/xyzen/api/v1/sessions/by-agent/${agentId}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );

    if (response.ok) {
      return response.json();
    }
  } catch {
    // Session lookup failed, will create new session
  }

  return null;
}

/**
 * Ensure session has provider and model configured
 */
async function ensureSessionHasProvider(
  session: SessionResponse,
  agent: AgentSessionInfo | null,
  providers: ProviderInfo[],
): Promise<SessionResponse> {
  if (session.provider_id && session.model) {
    return session;
  }

  try {
    const { providerId, model } = await resolveProviderAndModel(
      agent,
      providers,
    );

    if (providerId && model) {
      await sessionService.updateSession(session.id, {
        provider_id: providerId,
        model: model,
      });

      return {
        ...session,
        provider_id: providerId,
        model: model,
      };
    }
  } catch (error) {
    console.warn("Failed to update session with provider:", error);
  }

  return session;
}
