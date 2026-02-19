import { isValidUuid } from "@/core/chat";
import { generateClientId } from "@/core/chat/messageProcessor";
import { messageService } from "@/service/messageService";
import xyzenService from "@/service/xyzenService";
import i18n from "i18next";
import type { ChatSlice, GetState, Helpers, SetState } from "./types";

export function createMessageActions(
  set: SetState,
  get: GetState,
  helpers: Helpers,
) {
  const { updateDerivedStatus, waitForChannelConnection } = helpers;

  return {
    sendMessage: async (message: string) => {
      const {
        activeChatChannel,
        uploadedFiles,
        clearFiles,
        isUploading,
        channels,
        connectToChannel,
        showNotification,
      } = get();

      if (!activeChatChannel) return;

      // Don't allow sending while files are uploading
      if (isUploading) {
        console.warn("Cannot send message while files are uploading");
        return;
      }

      const activeChannel = channels[activeChatChannel];
      if (!activeChannel) return;

      // Don't allow sending while the channel is still generating a response
      if (activeChannel.responding) {
        console.warn("Cannot send message while assistant is responding");
        return;
      }

      // Ensure websocket is connected to the active topic before sending.
      if (!activeChannel.connected) {
        connectToChannel(activeChannel.sessionId, activeChannel.id);
        await waitForChannelConnection(activeChatChannel);
      }

      const recheckedChannel = get().channels[activeChatChannel];
      if (!recheckedChannel?.connected) {
        showNotification(
          "Connection not ready",
          "Please wait for chat connection and try again.",
          "warning",
        );
        return;
      }

      // Generate a client_id to correlate the optimistic message with the backend echo
      const clientId = generateClientId();

      // Collect completed file IDs
      const completedFiles = uploadedFiles.filter(
        (f) => f.status === "completed" && f.uploadedId,
      );

      // Build attachment previews from uploaded files for optimistic rendering
      const optimisticAttachments = completedFiles.map((f) => ({
        id: f.uploadedId!,
        name: f.file.name,
        type: f.file.type,
        size: f.file.size,
        category: (f.file.type.startsWith("image/")
          ? "images"
          : f.file.type.startsWith("audio/")
            ? "audio"
            : f.file.type === "application/pdf" ||
                f.file.type.includes("document")
              ? "documents"
              : "others") as "images" | "documents" | "audio" | "others",
      }));

      // --- Optimistic insert: render user message immediately ---
      set((state: ChatSlice) => {
        const channel = state.channels[activeChatChannel];
        if (channel) {
          channel.responding = true;
          channel.messages.push({
            id: clientId,
            clientId,
            role: "user",
            content: message,
            created_at: new Date().toISOString(),
            status: "sending",
            isNewMessage: true,
            ...(optimisticAttachments.length > 0
              ? { attachments: optimisticAttachments }
              : {}),
          });
        }
      });
      updateDerivedStatus();

      const payload: Record<string, unknown> = {
        message,
        client_id: clientId,
      };
      if (completedFiles.length > 0) {
        payload.file_ids = completedFiles.map((f) => f.uploadedId!);
      }

      const channel = recheckedChannel;
      if (channel?.knowledgeContext) {
        payload.context = channel.knowledgeContext;
      }

      const sendSuccess = xyzenService.sendStructuredMessage(payload);

      if (!sendSuccess) {
        // Mark optimistic message as failed instead of removing it
        set((state: ChatSlice) => {
          const ch = state.channels[activeChatChannel];
          if (ch) {
            ch.responding = false;
            const optimisticMsg = ch.messages.find(
              (m) => m.clientId === clientId,
            );
            if (optimisticMsg) {
              optimisticMsg.status = "failed";
            }
          }
        });
        updateDerivedStatus();
        return;
      }

      // Clear files after sending (don't delete from server - they're now linked to the message)
      clearFiles(false);
    },

    startEditMessage: (
      messageId: string,
      content: string,
      mode: "edit_only" | "edit_and_regenerate",
    ) => {
      set({
        editingMessageId: messageId,
        editingContent: content,
        editingMode: mode,
      });
    },

    cancelEditMessage: () => {
      set({
        editingMessageId: null,
        editingContent: "",
        editingMode: null,
      });
    },

    submitEditMessage: async () => {
      const {
        editingMessageId,
        editingContent,
        editingMode,
        activeChatChannel,
        channels,
      } = get();
      if (!editingMessageId || !activeChatChannel || !editingMode) return;

      const channel = channels[activeChatChannel];
      if (!channel) return;

      // Verify message belongs to the active channel before editing
      const messageExists = channel.messages.some(
        (m) => m.id === editingMessageId,
      );
      if (!messageExists) {
        console.error("Message not found in active channel, skipping edit");
        get().cancelEditMessage();
        return;
      }

      const truncateAndRegenerate = editingMode === "edit_and_regenerate";

      try {
        const result = await messageService.editMessage(editingMessageId, {
          content: editingContent,
          truncate_and_regenerate: truncateAndRegenerate,
        });

        // Update local state based on edit mode
        set((state: ChatSlice) => {
          const ch = state.channels[activeChatChannel];
          if (!ch) return;

          // Find the edited message index
          const editedIndex = ch.messages.findIndex(
            (m) => m.id === editingMessageId,
          );
          if (editedIndex === -1) return;

          // Update the message with server response
          ch.messages[editedIndex].content = result.message.content;
          ch.messages[editedIndex].created_at = result.message.created_at;

          // Only remove subsequent messages if truncate_and_regenerate was requested
          if (truncateAndRegenerate) {
            ch.messages = ch.messages.slice(0, editedIndex + 1);
            // Reset responding state before regeneration to avoid stuck UI
            ch.responding = false;
          }

          // Clear edit mode
          state.editingMessageId = null;
          state.editingContent = "";
          state.editingMode = null;
        });

        // Trigger regeneration if needed
        if (result.regenerate) {
          get().triggerRegeneration();
        }
      } catch (error) {
        console.error("Failed to edit message:", error);
        get().showNotification(
          "Error",
          i18n.t("app.message.editFailed"),
          "error",
        );
      }
    },

    triggerRegeneration: () => {
      const { activeChatChannel } = get();
      if (!activeChatChannel) return;

      // Send regeneration request via WebSocket
      xyzenService.sendStructuredMessage({
        type: "regenerate",
      });

      // Mark channel as responding
      set((state: ChatSlice) => {
        const channel = state.channels[activeChatChannel];
        if (channel) {
          channel.responding = true;
        }
      });
    },

    deleteMessage: async (messageId: string) => {
      const { activeChatChannel, channels } = get();
      if (!activeChatChannel) return;

      const channel = channels[activeChatChannel];
      if (!channel) return;

      // Check if the message ID is a server-assigned UUID (not a client-generated temporary ID)
      if (!isValidUuid(messageId)) {
        // Find the message to provide contextual error
        const message = channel.messages.find((m) => m.id === messageId);
        const reason = message?.isStreaming
          ? i18n.t("app.message.deleteStillStreaming")
          : i18n.t("app.message.deleteNotSaved");
        console.error(
          `Cannot delete message: ${reason} (id: ${messageId.slice(0, 20)}...)`,
        );
        get().showNotification(
          i18n.t("app.message.cannotDelete"),
          reason,
          "warning",
        );
        return;
      }

      // Verify message belongs to the active channel before deleting
      const messageExists = channel.messages.some((m) => m.id === messageId);
      if (!messageExists) {
        console.error("Message not found in active channel, skipping delete");
        return;
      }

      try {
        await messageService.deleteMessage(messageId);

        // Remove message from local state
        set((state: ChatSlice) => {
          const channel = state.channels[activeChatChannel];
          if (!channel) return;

          channel.messages = channel.messages.filter((m) => m.id !== messageId);
        });
      } catch (error) {
        console.error("Failed to delete message:", error);
        get().showNotification(
          "Error",
          i18n.t("app.message.deleteFailed"),
          "error",
        );
      }
    },

    retryMessage: (messageId: string) => {
      const { activeChatChannel, channels, sendMessage } = get();
      if (!activeChatChannel) return;

      const channel = channels[activeChatChannel];
      if (!channel) return;

      const message = channel.messages.find((m) => m.id === messageId);
      if (!message || message.status !== "failed") return;

      const content = message.content;

      // Remove the failed message locally (it was never persisted)
      set((state: ChatSlice) => {
        const ch = state.channels[activeChatChannel];
        if (ch) {
          ch.messages = ch.messages.filter((m) => m.id !== messageId);
        }
      });

      // Resend
      sendMessage(content);
    },
  };
}
