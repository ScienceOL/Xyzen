"""
Scientific Figure Agent - Generate beautiful scientific visualizations using ECharts

This agent uses LLM reasoning to understand user requests and creates appropriate
scientific figures including scatter plots, line graphs, histograms, and other
statistical visualizations. It leverages the frontend's ECharts integration to
produce interactive, themed charts based on user intent.
"""

import json
import logging
from typing import Any, Dict, List

from langchain_core.messages import HumanMessage, SystemMessage
from langgraph.graph import StateGraph
from langgraph.graph.state import CompiledStateGraph

from app.core.chat.langgraph import GraphState

from .base_graph_agent import BaseBuiltinGraphAgent

logger = logging.getLogger(__name__)


class ScientificFigureAgent(BaseBuiltinGraphAgent):
    """
    Agent for generating scientific figures and data visualizations.

    This agent can create various types of scientific plots:
    - Scatter plots for correlation analysis
    - Line plots for time series and function visualization
    - Bar charts for categorical data comparison
    - Histograms for distribution analysis
    - Heatmaps for correlation matrices
    - Multi-series plots for dataset comparison
    """

    def __init__(self):
        super().__init__(
            name="Scientific Figure Generator",
            description="Generate beautiful scientific figures and data visualizations using ECharts",
            version="1.0.0",
            capabilities=[
                "data_visualization",
                "scientific_plotting",
                "statistical_analysis",
                "chart_generation",
                "mathematical_functions",
            ],
            tags=["science", "visualization", "data", "charts", "analysis"],
            author="Xyzen System",
            license_="MIT",
        )

    def build_graph(self) -> CompiledStateGraph:
        """Build the scientific figure generation workflow using LLM reasoning."""
        from app.core.chat.langgraph import GraphState

        graph = StateGraph(GraphState)

        # Add workflow nodes
        graph.add_node("understand_request", self._understand_request)
        graph.add_node("generate_chart", self._generate_chart_with_llm)
        graph.add_node("format_response", self._format_response)

        # Define conditional routing based on LLM analysis
        def should_generate_chart(state: GraphState) -> str:
            """Route based on LLM understanding of user intent."""
            intent = state.execution_context.get("user_intent", "chat")
            if intent == "chart":
                return "generate_chart"
            else:
                return "format_response"  # Return conversational response

        # Define workflow edges
        graph.add_conditional_edges(
            "understand_request",
            should_generate_chart,
            {"generate_chart": "generate_chart", "format_response": "format_response"},
        )

        graph.add_edge("generate_chart", "format_response")

        # Set entry point
        graph.set_entry_point("understand_request")

        return graph.compile()

    def get_state_schema(self) -> Dict[str, Any]:
        """Return the state schema for scientific figure generation."""
        return {
            "messages": "List of conversation messages",
            "current_step": "Current execution step",
            "execution_context": "Context containing plot_type, data_params, generated_data, chart_config, etc.",
            "user_input": "User's request for scientific visualization",
            "final_output": "Final formatted response with chart configuration",
            "error": "Error message if any step fails",
        }

    def get_display_name(self) -> str:
        """Return display name with science emoji."""
        return "🔬 Scientific Figure Generator"

    def get_icon(self) -> str:
        """Return science icon."""
        return "🔬"

    def get_required_tools(self) -> List[str]:
        """No external tools required."""
        return []

    def get_estimated_execution_time(self) -> int:
        """Estimated execution time in seconds."""
        return 3

    async def _understand_request(self, state: "GraphState") -> "GraphState":
        """Use LLM to understand user request and determine intent."""
        logger.debug("Understanding user request with LLM")
        state.current_step = "understand_request"

        # Get user input
        user_message = state.user_input
        if not user_message and state.messages:
            for msg in reversed(state.messages):
                if hasattr(msg, "content"):
                    user_message = msg.content
                    break

        if not user_message:
            user_message = "Hello"

        system_prompt = """You are a Scientific Figure Assistant that analyzes user requests to determine intent.

Analyze the user's message and determine:
1. Whether they want to create a chart/visualization (intent: "chart") OR have a conversation (intent: "chat")
2. If chart: what type and what specific data context they want

Chart types: scatter, line, bar, histogram, heatmap, function

Respond with JSON:
{
    "intent": "chart" or "chat",
    "chart_type": "scatter|line|bar|histogram|heatmap|function" (only if chart),
    "reasoning": "Brief explanation of your decision",
    "data_context": "What specific data/scenario they want visualized"
}

Examples:
- "Create a scatter plot showing temperature vs humidity" → {"intent": "chart", "chart_type": "scatter", "reasoning": "User explicitly requests scatter plot with specific variables", "data_context": "temperature vs humidity relationship"}
- "Show me sales trends over time" → {"intent": "chart", "chart_type": "line", "reasoning": "Trends over time indicate line chart", "data_context": "sales performance temporal analysis"}
- "How are you doing?" → {"intent": "chat", "reasoning": "Casual greeting, no visualization request", "data_context": null}"""

        try:
            from app.core.providers import SYSTEM_USER_ID, get_user_provider_manager
            from app.infra.database import AsyncSessionLocal

            # Use system provider as fallback for builtin agents
            async with AsyncSessionLocal() as db:
                provider_manager = await get_user_provider_manager(SYSTEM_USER_ID, db)
                llm = provider_manager.create_langchain_model()

            messages = [SystemMessage(content=system_prompt), HumanMessage(content=f"User message: {user_message}")]

            response = await llm.ainvoke(messages)
            response_content = response.content if hasattr(response, "content") else str(response)

            # Ensure response_content is a string
            if isinstance(response_content, list):
                response_content = str(response_content)

            try:
                analysis = json.loads(response_content)
                logger.debug(f"LLM analysis: {analysis}")
            except json.JSONDecodeError:
                logger.error(f"Failed to parse LLM response: {response_content}")
                raise ValueError("LLM returned invalid JSON")

            state.execution_context.update(
                {
                    "user_intent": analysis.get("intent", "chat"),
                    "chart_type": analysis.get("chart_type"),
                    "llm_reasoning": analysis.get("reasoning", ""),
                    "data_context": analysis.get("data_context", ""),
                    "original_request": user_message,
                }
            )

            logger.debug(f"Intent: {analysis.get('intent')}, Type: {analysis.get('chart_type')}")
            return state

        except Exception as e:
            logger.error(f"LLM intent detection failed: {e}")
            raise RuntimeError(f"Failed to understand user request: {e}")

    async def _generate_chart_with_llm(self, state: "GraphState") -> "GraphState":
        """Use LLM to generate appropriate chart data following user instructions."""
        logger.debug("Generating chart with LLM")
        state.current_step = "generate_chart"

        chart_type = state.execution_context.get("chart_type", "scatter")
        data_context = state.execution_context.get("data_context", "")
        original_request = state.execution_context.get("original_request", "")

        system_prompt = f"""You are a Scientific Data & Visualization Designer. Create realistic data AND beautiful styling based on user requests.

User Request: {original_request}
Chart Type: {chart_type}
Data Context: {data_context}

Generate appropriate data AND visual styling that follows the user's specific instructions. Make it:
1. Scientifically realistic and meaningful data
2. Relevant to their exact request
3. Properly formatted for {chart_type} charts
4. Include descriptive titles and labels based on their request
5. KEEP IT SIMPLE unless user asks for complex multi-series or styling

## VISUAL STYLING CAPABILITIES:
- **Colors**: Custom palettes, gradients, theme-based colors
- **Animations**: Smooth transitions, staggered animations, custom easing
- **Visual Effects**: Shadows, glows, emphasis effects
- **Layout**: Custom spacing, positioning, responsive design
- **Interactive**: Enhanced tooltips, zoom controls, brush selection
- **Typography**: Custom fonts, sizes, weights

## STYLING KEYWORDS TO WATCH FOR:
- Colors: "blue", "red", "dark", "bright", "gradient", "colorful"
- Style: "modern", "elegant", "professional", "minimal", "vibrant"
- Effects: "animated", "smooth", "glowing", "shadow", "3D"
- Theme: "dark mode", "light", "scientific", "business", "artistic"

Return JSON in this EXACT format:
{{
    "type": "{chart_type}",
    "title": "Descriptive title based on user request",
    "data": [data array - format depends on chart type],
    "xAxis": {{"name": "X-axis label", "type": "value or category"}},
    "yAxis": {{"name": "Y-axis label", "type": "value"}},
    "options": {{
        "color": ["#2563EB", "#059669", "#DC2626", "#9333EA", "#EA580C"],
        "animation": true,
        "tooltip": {{"trigger": "item"}},
        "toolbox": {{"feature": {{"saveAsImage": {{"show": true}}}}}}
    }}
}}

FOR HEATMAPS (correlation matrices, time-based patterns, etc.):
{{
    "type": "heatmap",
    "title": "Descriptive title based on user request",
    "data": [{{"x": "Mon", "y": "9AM", "value": 0.85}}, {{"x": "Mon", "y": "10AM", "value": 0.92}}, {{"x": "Tue", "y": "9AM", "value": 0.78}}, ...],
    "xAxis": {{"name": "X-axis label", "type": "category"}},
    "yAxis": {{"name": "Y-axis label", "type": "category"}},
    "options": {{
        "animation": true,
        "tooltip": {{"trigger": "item"}},
        "toolbox": {{"feature": {{"saveAsImage": {{"show": true}}}}}}
    }}
}}

## EXAMPLES OF STYLING CUSTOMIZATION:

**For "dark blue theme"**: Use color palette like ["#1e3a8a", "#3b82f6", "#60a5fa", "#93c5fd"]
**For "warm colors"**: Use ["#dc2626", "#ea580c", "#d97706", "#ca8a04"]
**For "professional look"**: Use subtle colors, clean lines, minimal effects
**For "vibrant/colorful"**: Use bright palette with gradients and animations
**For "minimal"**: Reduce visual effects, use simple colors, clean layout

Data format requirements:
- scatter/line: [{{"x": number, "y": number}}, ...]
- bar: array of values PLUS separate "labels" array for categories
- histogram: array of raw values to be binned
- heatmap: [{{"x": "category1", "y": "category2", "value": number}}, ...] for coordinate format
  OR [[val1, val2, val3], [val4, val5, val6], ...] for matrix format

IMPORTANT:
1. Follow the user's specific request for BOTH data and visual styling
2. If they mention colors, themes, or visual preferences, customize the options accordingly
3. If no visual preferences mentioned, use beautiful defaults that match the data theme
4. Make it scientifically accurate AND visually stunning
5. ONLY include series styling that applies to the chart type:
   - scatter/pie: "itemStyle", "emphasis" only
   - line/area: "lineStyle", "itemStyle", "areaStyle", "emphasis"
   - bar: "itemStyle", "emphasis" only
6. Do NOT include "lineStyle" or "areaStyle" for scatter or bar charts"""

        try:
            from app.core.providers import SYSTEM_USER_ID, get_user_provider_manager
            from app.infra.database import AsyncSessionLocal

            # Use system provider as fallback for builtin agents
            async with AsyncSessionLocal() as db:
                provider_manager = await get_user_provider_manager(SYSTEM_USER_ID, db)
                llm = provider_manager.create_langchain_model()

            messages = [
                SystemMessage(content=system_prompt),
                HumanMessage(content=f"Generate {chart_type} chart for: {original_request}"),
            ]

            response = await llm.ainvoke(messages)
            response_content = response.content if hasattr(response, "content") else str(response)

            # Ensure response_content is a string
            if isinstance(response_content, list):
                response_content = str(response_content)

            try:
                # Extract JSON from response if it's wrapped in text
                if "```json" in response_content:
                    json_start = response_content.find("```json") + 7
                    json_end = response_content.find("```", json_start)
                    response_content = response_content[json_start:json_end].strip()
                elif "{" in response_content:
                    # Find first { and last }
                    start = response_content.find("{")
                    end = response_content.rfind("}") + 1
                    response_content = response_content[start:end]

                chart_config = json.loads(response_content)
                logger.debug(f"Generated chart config: {chart_config}")

                state.execution_context["chart_config"] = chart_config
                return state

            except json.JSONDecodeError as e:
                logger.error(f"Failed to parse chart config JSON: {response_content}")
                raise ValueError(f"LLM returned invalid chart JSON: {e}")

        except Exception as e:
            logger.error(f"Chart generation failed: {e}")
            raise RuntimeError(f"Failed to generate chart: {e}")

    async def _format_response(self, state: "GraphState") -> "GraphState":
        """Format final response for chart or conversation using LLM."""
        logger.debug("Formatting final response")
        state.current_step = "format_response"

        user_intent = state.execution_context.get("user_intent", "chat")
        original_request = state.execution_context.get("original_request", "")

        logger.debug(f"Formatting response for intent: {user_intent}")

        if user_intent == "chart":
            # Format chart response
            chart_config = state.execution_context.get("chart_config", {})
            chart_type = chart_config.get("type", "visualization")

            # Use structured chart object format that the frontend can detect
            wrapped_chart_config = {"chart": chart_config}

            # Create response message with chart data
            response_content = f"""Here's your {chart_type} visualization:

{json.dumps(wrapped_chart_config)}"""
            logger.debug(f"Generated chart response with {chart_type}")

        else:
            # Generate LLM-based conversational response
            response_content = await self._generate_llm_conversational_response(original_request)
            logger.debug("Generated LLM conversational response")

        # Store final output and update messages
        from langchain_core.messages import AIMessage

        state.messages.append(AIMessage(content=response_content))
        state.final_output = response_content

        return state

    async def _generate_llm_conversational_response(self, original_request: str) -> str:
        """Generate conversational response using LLM."""
        system_prompt = """You are a Scientific Figure Assistant. When users chat with you (not asking for charts), respond naturally and helpfully as an AI assistant specialized in data visualization.

Key traits:
- Friendly and conversational
- Knowledgeable about scientific visualizations
- Can discuss data analysis, visualization best practices, chart types
- Don't be overly promotional about your chart capabilities
- Respond naturally to greetings, questions, or general conversation
- If they ask about your capabilities, mention you can create scatter plots, line charts, bar charts, histograms, and heatmaps

Respond conversationally to their message. Keep it natural and engaging."""

        try:
            from app.core.providers import SYSTEM_USER_ID, get_user_provider_manager
            from app.infra.database import AsyncSessionLocal

            # Use system provider as fallback for builtin agents
            async with AsyncSessionLocal() as db:
                provider_manager = await get_user_provider_manager(SYSTEM_USER_ID, db)
                llm = provider_manager.create_langchain_model()

            messages = [SystemMessage(content=system_prompt), HumanMessage(content=f"User message: {original_request}")]

            response = await llm.ainvoke(messages)
            response_content = response.content if hasattr(response, "content") else str(response)

            # Ensure response_content is a string
            if isinstance(response_content, list):
                response_content = str(response_content)

            logger.debug(f"Generated LLM conversational response: {response_content}")
            return response_content.strip()

        except Exception as e:
            logger.error(f"LLM conversational response failed: {e}")
            raise RuntimeError(f"Failed to generate conversational response: {e}")


# Create instance for auto-discovery
scientific_figure_agent = ScientificFigureAgent()
