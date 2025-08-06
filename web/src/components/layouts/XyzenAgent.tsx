'use client'
import React, { useEffect, useState } from 'react';
import { useXyzen } from "@/store/xyzenStore";

const agents = [
    {
        "id": "agent-1",
        "name": "编程助手",
        "description": "精通 JavaScript、Python 和算法题的编程专家。",
        "avatar": "https://example.com/avatar/coding.png",
        "tags": ["编程", "技术", "算法"],
        "model": "GPT-4",
        "temperature": 0.2
    },
    {
        "id": "agent-2",
        "name": "文案创作助手",
        "description": "擅长写作、广告文案和内容创意，适合市场营销场景。",
        "avatar": "https://example.com/avatar/copywriter.png",
        "tags": ["写作", "创意", "营销"],
        "model": "GPT-4o",
        "temperature": 0.7
    },
    {
        "id": "agent-3",
        "name": "英语翻译官",
        "description": "中英互译精准流畅，适合日常、专业、法律类文本翻译。",
        "avatar": "https://example.com/avatar/translator.png",
        "tags": ["翻译", "语言", "英文"],
        "model": "GPT-3.5",
        "temperature": 0.3
    },
    {
        "id": "agent-4",
        "name": "心理陪伴者",
        "description": "温柔体贴，擅长倾听与情绪疏导，不提供医疗建议。",
        "avatar": "https://example.com/avatar/therapy.png",
        "tags": ["情绪", "陪伴", "温暖"],
        "model": "GPT-4",
        "temperature": 0.9
    },
    {
        "id": "agent-5",
        "name": "产品经理助手",
        "description": "擅长撰写PRD、制作需求文档、头脑风暴产品创意。",
        "avatar": "https://example.com/avatar/pm.png",
        "tags": ["产品", "分析", "文档"],
        "model": "GPT-4",
        "temperature": 0.5
    }
]

export type Agent = {
    id: string;
    name: string;
    description: string;
    avatar: string;
    tags: string[];
    model: string;
    temperature: number;
};

interface AgentCardProps {
    agent: Agent;
    onClick?: (agent: Agent) => void;
    selected?: boolean;
}

// 详细版本-包括名字，描述，头像，标签以及GPT模型
const AgentCard: React.FC<AgentCardProps> = ({ agent, selected, onClick }) => {
  return (
    <div
        onClick={() => onClick?.(agent)}
        className={`
            group relative flex items-start gap-4 p-4 mb-3 rounded-2xl transition-all duration-200 cursor-pointer
            border bg-white/10 backdrop-blur-xl shadow-md
            ${
            selected
                ? 'bg-gradient-to-r from-purple-300/30 via-pink-300/30 to-blue-300/30 text-white border-transparent ring-2 ring-purple-400/40'
                : 'bg-white/10 border border-white/20 text-gray-800 hover:bg-gradient-to-r hover:from-purple-100/20 hover:via-pink-100/20 hover:to-blue-100/20 hover:border-purple-300/40 hover:text-gray-900'
            }
        `}
    >
      {/* 头像 */}
      <img
        src='https://cdn1.deepmd.net/static/img/affb038eChatGPT Image 2025年8月6日 10_33_07.png'
        alt={agent.name}
        className="h-10 w-10 rounded-full object-cover border border-white/30 shadow-sm"
      />

      {/* 内容 */}
      <div className="flex flex-col flex-1">
        <div className="flex justify-between items-center">
          <h3 className="text-sm font-semibold text-gray-800">{agent.name}</h3>
          <span className="text-xs text-purple-500">{agent.model}</span>
        </div>

        <p className="text-xs text-gray-600 line-clamp-2 mt-1">{agent.description}</p>

        <div className="flex flex-wrap gap-1 mt-2">
          {agent.tags.map((tag) => (
            <span
              key={tag}
              className="text-[10px] px-2 py-0.5 rounded-full bg-gradient-to-r from-purple-500/30 to-blue-500/30 text-white"
            >
              {tag}
            </span>
          ))}
        </div>
      </div>

      {/* 选中状态圆点 */}
      {selected && (
        <div className="absolute top-2 right-2 h-2 w-2 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 ring-2 ring-white" />
      )}
    </div>
  );
};

// 仅有头像和名字

// const AgentCard: React.FC<AgentCardProps> = ({ agent, onClick, selected }) => {
//     const [menuVisible, setMenuVisible] = useState(false);
//     const removeAgent = useXyzen((state) => state.removeAgent);
//     const handleContextMenu = (e: React.MouseEvent) => {
//         e.preventDefault();
//         setMenuVisible(true);
//     };

//     const handleDelete = (event: React.MouseEvent) => {
//         removeAgent(agent.id);
//         setMenuVisible(false);
//         event.stopPropagation();
//     };

//     const handleClickOutside = () => {
//         setMenuVisible(false);
//     };

//     useEffect(() => {
//         const handleClick = () => {
//             setMenuVisible(false);
//         };
//         document.addEventListener('click', handleClick);
//         return () => document.removeEventListener('click', handleClick);
//     }, []);


//     return (
//         <div
//             onClick={() => onClick?.(agent)} // 将 agent 传出去
//             onContextMenu={handleContextMenu}
//             className={`
//         group relative flex items-center gap-4 p-4 mb-3 rounded-2xl transition-all duration-200 cursor-pointer
//         border bg-white/10 backdrop-blur-xl shadow-lg
//         ${selected
//                     ? 'bg-gradient-to-r from-purple-300/30 via-pink-300/30 to-blue-300/30 text-gray-800 border-transparent ring-2 ring-purple-400/40'
//                     : 'bg-white/10 border border-white/20 text-gray-800 hover:bg-gradient-to-r hover:from-purple-100/20 hover:via-pink-100/20 hover:to-blue-100/20 hover:border-purple-300/40 hover:text-gray-900'
//                 }
//       `}
//         >
//             {/* 头像 */}
//             <img
//                 src='https://cdn1.deepmd.net/static/img/affb038eChatGPT Image 2025年8月6日 10_33_07.png'
//                 alt={agent.name}
//                 className="h-10 w-10 rounded-full object-cover border border-white/30 shadow-sm"
//             />

//             {/* 名称 */}
//             <div className="flex-1 text-sm font-semibold text-inherit">
//                 {agent.name}
//             </div>

//             {/* 选中状态圆点 */}
//             {selected && (
//                 <div className="absolute top-2 right-2 h-2 w-2 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 ring-2 ring-white" />
//             )}

//             {/* 右键菜单 */}
//             {menuVisible && (
//                 <div
//                     className="absolute z-50 text-sm rounded-md"
//                     style={{
//                         top: 25,
//                         right: 10,
//                     }}
//                     onClick={handleClickOutside}
//                 >
//                     <button
//                         onClick={handleDelete}
//                         title='删除'
//                         className="block hover:bg-red-100 text-red-600 w-full text-left"
//                     >
//                         <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="size-6">
//                             <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
//                         </svg>
//                     </button>
//                 </div>
//             )}

//         </div>
//     );
// };

export default function XyzenAgent() {
    const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
    // const agents = useXyzen((state) => state.agents);
    // const { createDefaultChannel } = useXyzen();
    const handleAgentClick = (agent: Agent) => {
        // createDefaultChannel(agent); // 👈 传入 agent
        setSelectedAgentId(agent.id);
    };

    return (
        <div className="w-full flex flex-col p-2 overflow-y-auto">
            {agents.map((agent) => (
                <AgentCard
                    key={agent.id}
                    agent={agent}
                    selected={agent.id === selectedAgentId}
                    onClick={handleAgentClick}
                />
            ))}
        </div>

    );
}
