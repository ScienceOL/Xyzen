# Product Interaction Design: Spatial Agent Workspace

## Vision

To transform the user experience from managing a "list of tools" to entering a "digital workspace" where Agents are active, specialized assets. The interface balances high-density information with immersive focus states.

## Core Concepts

### 1. The Canvas (The Team View)

Instead of a flat list, Agents exist on an infinite 2D canvas.

- **Visuals**: Agents are represented as "Nodes" or "Bases" rather than simple list items.
- **States**:
  - **Idle**: Subtle pulsing or static.
  - **Working**: Glowing, animated data streams.
  - **Collaborating**: Connecting lines between agents.
- **Interaction**: Pan and zoom to explore the team. Drag agents to cluster them by function (e.g., "Creative Team", "Dev Ops").

### 2. The Focus (The Deep Dive)

Transitions should be seamless, maintaining context while focusing on the task.

- **Action**: Clicking an Agent transitions from "Map View" to "Focus View".
- **Animation**: The camera smoothly zooms in to the specific Agent node. The background (other agents) blurs but remains visible in the periphery, providing a sense of "location" within the system.
- **Feedback**: The "Chat Window" isn't a separate page; it slides out from the Agent node itself, reinforcing that you are talking _to_ that specific entity.

### 3. The Workspace (The Chat Interface)

The chat interface is the primary daily driver, so it expands to occupy valuable screen real estate while keeping asset context available.

- **Layout**:
  - **Left/Center (Chat)**: Wide, comfortable reading area. The primary focus.
  - **Right (Context/Assets)**: Collapsible sidebar showing the Agent's specific "Memory", "Tools", and "Files".
- **Switching**:
  - **Fast Switch**: A "Dock" or "Mini-map" allows jumping between recently used agents without zooming all the way out.
  - **Zoom Out**: A gesture or button seamlessly pulls the camera back to the Canvas view to see the whole team.

## User Journey: "Hiring to Commanding"

1.  **Enter Workspace**: User lands on the Canvas. See 5 Agents scattered. "Market Analysis" agent is glowing red (busy).
2.  **Select**: User clicks "Market Analysis".
3.  **Transition**: Screen zooms in. Background blurs. Chat window slides in from the right, occupying 70% of the screen.
4.  **Engage**: User chats. Uploads a PDF.
5.  **Multitask**: User needs "Copywriter".
    - _Option A_: Zoom out (Esc), find Copywriter, Zoom in.
    - _Option B (Fast)_: Click "Copywriter" from the Quick Dock. Camera pans laterally to the Copywriter node.
6.  **Collaborate**: User drags a connecting line from "Market Analysis" output to "Copywriter".

## Technical Prototype

The accompanying `SpatialWorkspace` component demonstrates:

- **Spatial Layout**: Absolute positioning on a scalable surface.
- **Camera Logic**: Calculating translation and scale to center a target element.
- **Immersive Transition**: CSS/Motion transitions for smooth zooming.
- **Contextual Chat**: Sidebar entry upon focus.

This design elevates the Agent from a "row in a database" to a "teammate at a desk".
