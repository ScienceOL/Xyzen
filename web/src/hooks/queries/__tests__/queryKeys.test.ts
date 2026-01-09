/**
 * Tests for query key factory
 *
 * Ensures query keys are consistent and properly structured
 * for effective cache invalidation.
 */

import { describe, it, expect } from "vitest";
import { queryKeys } from "../queryKeys";

describe("queryKeys", () => {
  describe("sessions", () => {
    it("has correct base key", () => {
      expect(queryKeys.sessions.all).toEqual(["sessions"]);
    });

    it("list extends base key", () => {
      const listKey = queryKeys.sessions.list();
      expect(listKey).toEqual(["sessions", "list"]);
      expect(listKey.slice(0, 1)).toEqual(queryKeys.sessions.all);
    });

    it("detail includes session ID", () => {
      const detailKey = queryKeys.sessions.detail("session-123");
      expect(detailKey).toEqual(["sessions", "detail", "session-123"]);
    });
  });

  describe("topics", () => {
    it("has correct base key", () => {
      expect(queryKeys.topics.all).toEqual(["topics"]);
    });

    it("messages key includes topic ID", () => {
      const messagesKey = queryKeys.topics.messages("topic-456");
      expect(messagesKey).toEqual(["topics", "topic-456", "messages"]);
    });

    it("detail key includes topic ID", () => {
      const detailKey = queryKeys.topics.detail("topic-789");
      expect(detailKey).toEqual(["topics", "detail", "topic-789"]);
    });
  });

  describe("providers", () => {
    it("has correct base key", () => {
      expect(queryKeys.providers.all).toEqual(["providers"]);
    });

    it("my key extends base", () => {
      expect(queryKeys.providers.my()).toEqual(["providers", "my"]);
    });

    it("templates key extends base", () => {
      expect(queryKeys.providers.templates()).toEqual([
        "providers",
        "templates",
      ]);
    });

    it("models key extends base", () => {
      expect(queryKeys.providers.models()).toEqual(["providers", "models"]);
    });

    it("defaultConfig key extends base", () => {
      expect(queryKeys.providers.defaultConfig()).toEqual([
        "providers",
        "defaultConfig",
      ]);
    });
  });

  describe("agents", () => {
    it("has correct base key", () => {
      expect(queryKeys.agents.all).toEqual(["agents"]);
    });

    it("list extends base", () => {
      expect(queryKeys.agents.list()).toEqual(["agents", "list"]);
    });

    it("detail includes agent ID", () => {
      expect(queryKeys.agents.detail("agent-001")).toEqual([
        "agents",
        "detail",
        "agent-001",
      ]);
    });
  });

  describe("knowledge", () => {
    it("has correct base key", () => {
      expect(queryKeys.knowledge.all).toEqual(["knowledge"]);
    });

    it("folders extends base", () => {
      expect(queryKeys.knowledge.folders()).toEqual(["knowledge", "folders"]);
    });

    it("files includes folder ID", () => {
      expect(queryKeys.knowledge.files("folder-123")).toEqual([
        "knowledge",
        "files",
        "folder-123",
      ]);
    });
  });

  describe("mcp", () => {
    it("has correct base key", () => {
      expect(queryKeys.mcp.all).toEqual(["mcp"]);
    });

    it("servers extends base", () => {
      expect(queryKeys.mcp.servers()).toEqual(["mcp", "servers"]);
    });

    it("tools includes server ID", () => {
      expect(queryKeys.mcp.tools("server-001")).toEqual([
        "mcp",
        "tools",
        "server-001",
      ]);
    });
  });

  describe("key hierarchy for cache invalidation", () => {
    it("all provider keys can be invalidated with base key", () => {
      const baseKey = queryKeys.providers.all;
      const myKey = queryKeys.providers.my();
      const templatesKey = queryKeys.providers.templates();
      const modelsKey = queryKeys.providers.models();

      // All keys start with the base key
      expect(myKey.slice(0, baseKey.length)).toEqual(baseKey);
      expect(templatesKey.slice(0, baseKey.length)).toEqual(baseKey);
      expect(modelsKey.slice(0, baseKey.length)).toEqual(baseKey);
    });

    it("all session keys can be invalidated with base key", () => {
      const baseKey = queryKeys.sessions.all;
      const listKey = queryKeys.sessions.list();
      const detailKey = queryKeys.sessions.detail("any-id");

      expect(listKey.slice(0, baseKey.length)).toEqual(baseKey);
      expect(detailKey.slice(0, baseKey.length)).toEqual(baseKey);
    });
  });
});
