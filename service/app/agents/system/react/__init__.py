"""
ReAct System Agent

The default tool-calling agent using the ReAct (Reasoning + Acting) pattern.
This is the standard agent for chat conversations with tool use.

Usage:
    from app.agents.system.react import ReActAgent

    agent = ReActAgent()
    agent.configure(llm=my_llm, tools=[tool1, tool2])
    graph = agent.build_graph()

    result = await graph.ainvoke({"messages": [HumanMessage(content="Hello")]})
"""

from .agent import ReActAgent

__all__ = ["ReActAgent"]
