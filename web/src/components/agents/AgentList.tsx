"use client";

import type { Agent } from "@/types/agents";
import {
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { motion, type Variants } from "framer-motion";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AgentListItem, type DragHandleProps } from "./AgentListItem";

// Container animation variants for detailed variant
const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.1,
    },
  },
};

// Sortable wrapper for AgentListItem
interface SortableItemProps {
  agent: Agent;
  variant: "detailed" | "compact";
  // Detailed variant props
  isMarketplacePublished?: boolean;
  lastConversationTime?: string;
  // Compact variant props
  isSelected?: boolean;
  status?: "idle" | "busy";
  role?: string;
  // Shared props
  onClick?: (agent: Agent) => void;
  onEdit?: (agent: Agent) => void;
  onDelete?: (agent: Agent) => void;
}

const SortableItem: React.FC<SortableItemProps> = ({
  agent,
  variant,
  isMarketplacePublished,
  lastConversationTime,
  isSelected,
  status,
  role,
  onClick,
  onEdit,
  onDelete,
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: agent.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const dragHandleProps: DragHandleProps = {
    attributes,
    listeners: listeners ?? {},
  };

  if (variant === "detailed") {
    return (
      <AgentListItem
        agent={agent}
        variant="detailed"
        isMarketplacePublished={isMarketplacePublished}
        lastConversationTime={lastConversationTime}
        onClick={onClick}
        onEdit={onEdit}
        onDelete={onDelete}
        isDragging={isDragging}
        dragHandleProps={dragHandleProps}
        style={style}
        setNodeRef={setNodeRef}
      />
    );
  }

  return (
    <AgentListItem
      agent={agent}
      variant="compact"
      isSelected={isSelected}
      status={status}
      role={role}
      isMarketplacePublished={isMarketplacePublished}
      onClick={onClick}
      onEdit={onEdit}
      onDelete={onDelete}
      isDragging={isDragging}
      dragHandleProps={dragHandleProps}
      style={style}
      setNodeRef={setNodeRef}
    />
  );
};

// Base props for both variants
interface AgentListBaseProps {
  agents: Agent[];
  onAgentClick?: (agent: Agent) => void;
  // Sorting support
  sortable?: boolean;
  onReorder?: (agentIds: string[]) => void;
}

// Props for detailed variant
interface DetailedAgentListProps extends AgentListBaseProps {
  variant: "detailed";
  publishedAgentIds?: Set<string>;
  lastConversationTimeByAgent?: Record<string, string>;
  onEdit?: (agent: Agent) => void;
  onDelete?: (agent: Agent) => void;
  // Compact variant props not used
  selectedAgentId?: never;
  getAgentStatus?: never;
  getAgentRole?: never;
}

// Props for compact variant
interface CompactAgentListProps extends AgentListBaseProps {
  variant: "compact";
  selectedAgentId?: string;
  getAgentStatus?: (agent: Agent) => "idle" | "busy";
  getAgentRole?: (agent: Agent) => string | undefined;
  // Right-click menu support (shared with detailed)
  publishedAgentIds?: Set<string>;
  onEdit?: (agent: Agent) => void;
  onDelete?: (agent: Agent) => void;
  // Detailed variant props not used
  lastConversationTimeByAgent?: never;
}

export type AgentListProps = DetailedAgentListProps | CompactAgentListProps;

export const AgentList: React.FC<AgentListProps> = (props) => {
  const { agents, variant, onAgentClick, sortable = false, onReorder } = props;

  // Local state for drag ordering
  const [items, setItems] = useState<Agent[]>(agents);
  const [activeId, setActiveId] = useState<string | null>(null);

  // Track whether user is actively dragging to prevent sync during drag
  const isDraggingRef = useRef(false);

  // Sync items when agents change (membership or order) - but not during drag
  useEffect(() => {
    // Don't sync during active drag operations
    if (isDraggingRef.current) return;

    // Compare as sets to detect membership changes
    const agentIdSet = new Set(agents.map((a) => a.id));
    const itemIdSet = new Set(items.map((a) => a.id));
    const membershipChanged =
      agentIdSet.size !== itemIdSet.size ||
      ![...agentIdSet].every((id) => itemIdSet.has(id));

    if (membershipChanged) {
      // Agents added or removed - reset to props
      setItems(agents);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `items` excluded intentionally to prevent infinite loop
  }, [agents]);

  const displayAgents = sortable ? items : agents;
  const activeAgent = activeId
    ? displayAgents.find((a) => a.id === activeId)
    : null;

  // Sensors for mouse and touch
  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: {
        distance: 10,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 250,
        tolerance: 5,
      },
    }),
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    isDraggingRef.current = true;
    setActiveId(event.active.id as string);
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      isDraggingRef.current = false;
      setActiveId(null);

      if (over && active.id !== over.id) {
        setItems((currentItems) => {
          const oldIndex = currentItems.findIndex((a) => a.id === active.id);
          const newIndex = currentItems.findIndex((a) => a.id === over.id);
          const newItems = arrayMove(currentItems, oldIndex, newIndex);
          // Call onReorder after state update via setTimeout to avoid render conflicts
          setTimeout(() => {
            onReorder?.(newItems.map((a) => a.id));
          }, 0);
          return newItems;
        });
      }
    },
    [onReorder],
  );

  const handleDragCancel = useCallback(() => {
    isDraggingRef.current = false;
    setActiveId(null);
  }, []);

  // Render overlay item
  const renderOverlayItem = () => {
    if (!activeAgent) return null;

    if (variant === "detailed") {
      const { publishedAgentIds, lastConversationTimeByAgent } =
        props as DetailedAgentListProps;
      return (
        <AgentListItem
          agent={activeAgent}
          variant="detailed"
          isMarketplacePublished={publishedAgentIds?.has(activeAgent.id)}
          lastConversationTime={lastConversationTimeByAgent?.[activeAgent.id]}
          isDragging={true}
        />
      );
    }

    const { selectedAgentId, getAgentStatus, getAgentRole, publishedAgentIds } =
      props as CompactAgentListProps;
    return (
      <AgentListItem
        agent={activeAgent}
        variant="compact"
        isSelected={activeAgent.id === selectedAgentId}
        status={getAgentStatus?.(activeAgent) ?? "idle"}
        role={getAgentRole?.(activeAgent)}
        isMarketplacePublished={publishedAgentIds?.has(activeAgent.id)}
        isDragging={true}
      />
    );
  };

  if (variant === "detailed") {
    const { publishedAgentIds, lastConversationTimeByAgent, onEdit, onDelete } =
      props as DetailedAgentListProps;

    const content = (
      <motion.div
        className="space-y-2"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {displayAgents.map((agent) =>
          sortable ? (
            <SortableItem
              key={agent.id}
              agent={agent}
              variant="detailed"
              isMarketplacePublished={publishedAgentIds?.has(agent.id)}
              lastConversationTime={lastConversationTimeByAgent?.[agent.id]}
              onClick={onAgentClick}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ) : (
            <AgentListItem
              key={agent.id}
              agent={agent}
              variant="detailed"
              isMarketplacePublished={publishedAgentIds?.has(agent.id)}
              lastConversationTime={lastConversationTimeByAgent?.[agent.id]}
              onClick={onAgentClick}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ),
        )}
      </motion.div>
    );

    if (sortable) {
      return (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          <SortableContext
            items={displayAgents.map((a) => a.id)}
            strategy={verticalListSortingStrategy}
          >
            {content}
          </SortableContext>
          {/* NOTE: Render DragOverlay into document.body to avoid positioning bugs when
              this list is inside a transformed/animated container (e.g. framer-motion).
              CSS transforms create a new containing block, which can cause @dnd-kit's
              fixed-position overlay to calculate coordinates relative to that container
              (often showing the dragged item jumping to the bottom). */}
          {createPortal(
            <DragOverlay>{renderOverlayItem()}</DragOverlay>,
            document.body,
          )}
        </DndContext>
      );
    }

    return content;
  }

  // Compact variant
  const {
    selectedAgentId,
    getAgentStatus,
    getAgentRole,
    publishedAgentIds,
    onEdit,
    onDelete,
  } = props as CompactAgentListProps;

  const content = (
    <div className="space-y-1">
      {displayAgents.map((agent) =>
        sortable ? (
          <SortableItem
            key={agent.id}
            agent={agent}
            variant="compact"
            isSelected={agent.id === selectedAgentId}
            status={getAgentStatus?.(agent) ?? "idle"}
            role={getAgentRole?.(agent)}
            isMarketplacePublished={publishedAgentIds?.has(agent.id)}
            onClick={onAgentClick}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ) : (
          <AgentListItem
            key={agent.id}
            agent={agent}
            variant="compact"
            isSelected={agent.id === selectedAgentId}
            status={getAgentStatus?.(agent) ?? "idle"}
            role={getAgentRole?.(agent)}
            isMarketplacePublished={publishedAgentIds?.has(agent.id)}
            onClick={onAgentClick}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ),
      )}
    </div>
  );

  if (sortable) {
    return (
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <SortableContext
          items={displayAgents.map((a) => a.id)}
          strategy={verticalListSortingStrategy}
        >
          {content}
        </SortableContext>
        {/* NOTE: Render DragOverlay into document.body to avoid positioning bugs when
            this list is inside a transformed/animated container (e.g. framer-motion).
            CSS transforms create a new containing block, which can cause @dnd-kit's
            fixed-position overlay to calculate coordinates relative to that container
            (often showing the dragged item jumping to the bottom). */}
        {createPortal(
          <DragOverlay>{renderOverlayItem()}</DragOverlay>,
          document.body,
        )}
      </DndContext>
    );
  }

  return content;
};

export default AgentList;
