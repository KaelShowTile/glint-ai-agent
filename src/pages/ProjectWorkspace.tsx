import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { ReactFlow, Controls, Background, Node, Edge, applyNodeChanges, applyEdgeChanges, NodeChange, EdgeChange, NodeMouseHandler } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { WorkflowTask, getTasks, saveTask } from '../lib/tasks';
import { getProjectById, updateProjectChatHistory, updateProjectStage } from '../lib/projects';
import { AIEmployee, getEmployeeById, getEmployees } from '../lib/employees';
import { callLLM, LLMMessage } from '../lib/llm';
import TaskModal from '../components/TaskModal';
import { Plus, LayoutGrid, Network, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

const initialNodes: Node[] = [];
const initialEdges: Edge[] = [];

export default function ProjectWorkspace() {
    const { id } = useParams();
    const projectId = parseInt(id || '0', 10);

    const [tasks, setTasks] = useState<WorkflowTask[]>([]);
    const [nodes, setNodes] = useState<Node[]>(initialNodes);
    const [edges, setEdges] = useState<Edge[]>(initialEdges);
    const [chatInput, setChatInput] = useState('');
    const [viewMode, setViewMode] = useState<'graph' | 'kanban'>('graph');
    const [manager, setManager] = useState<AIEmployee | null>(null);
    const [isChatLoading, setIsChatLoading] = useState(false);
    const [projectStage, setProjectStage] = useState<string>('research');

    // Resizing logic
    const [chatWidth, setChatWidth] = useState(350);
    const [isDragging, setIsDragging] = useState(false);

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isDragging) return;
            const newWidth = Math.max(250, Math.min(e.clientX, window.innerWidth - 300));
            setChatWidth(newWidth);
        };
        const handleMouseUp = () => setIsDragging(false);

        if (isDragging) {
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
        }
        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging]);

    const [chatHistory, setChatHistory] = useState<{ role: 'user' | 'manager', content: string }[]>([
        { role: 'manager', content: "Hello! I am your AI Project Manager. What kind of workflow would you like to build today?" }
    ]);
    const [selectedTask, setSelectedTask] = useState<WorkflowTask | null>(null);

    const loadTasks = async () => {
        if (!projectId) return;
        try {
            const proj = await getProjectById(projectId);
            if (proj) {
                if (proj.chat_history) {
                    try {
                        setChatHistory(JSON.parse(proj.chat_history));
                    } catch(e) {}
                } else if (proj.manager_ai_id) {
                    const emp = await getEmployeeById(proj.manager_ai_id);
                    if (emp) {
                         setChatHistory([{ role: 'manager', content: `Hello! I am ${emp.name}, your AI Project Manager. Let's design your workflow.` }]);
                    }
                }
                
                if (proj.manager_ai_id) {
                    const emp = await getEmployeeById(proj.manager_ai_id);
                    setManager(emp);
                }
                
                if (proj.stage) {
                    setProjectStage(proj.stage);
                }
            }

            const data = await getTasks(projectId);
            setTasks(data);

            const newNodes: Node[] = data.map((t, index) => ({
                id: t.id?.toString() || `temp-${index}`,
                position: { x: (index % 3) * 250 + 100, y: Math.floor(index / 3) * 150 + 100 },
                data: { label: t.title },
                type: 'default',
                className: 'react-flow__node'
            }));

            const newEdges: Edge[] = [];
            data.forEach(t => {
                if (t.parent_task_ids) {
                    try {
                        const parents = JSON.parse(t.parent_task_ids) as number[];
                        parents.forEach(pId => {
                            newEdges.push({
                                id: `e${pId}-${t.id}`,
                                source: pId.toString(),
                                target: t.id!.toString(),
                                animated: t.status === 'in-progress',
                            });
                        });
                    } catch (e) { }
                }
            });

            setNodes(newNodes);
            setEdges(newEdges);
        } catch (e) { console.error(e) }
    };

    useEffect(() => { loadTasks() }, [projectId]);

    const onNodesChange = useCallback(
        (changes: NodeChange[]) => setNodes((nds) => applyNodeChanges(changes, nds)),
        [],
    );
    const onEdgesChange = useCallback(
        (changes: EdgeChange[]) => setEdges((eds) => applyEdgeChanges(changes, eds)),
        [],
    );

    const getSystemPromptForStage = (stage: string, basePrompt: string, employeeContext: string) => {
        let stagePrompt = "";
        switch (stage) {
            case 'research':
                stagePrompt = "你现在是一名高级项目管理，你需要和人类同事(用户)以及其他AI同事一起开发项目。现在项目正处于调研阶段，用户会告诉你他/她的项目要求，你需要理解并分析用户需求。如果客户对需求的描述不清晰，或是你不能理解用户的意图，你应当首先和用户确认直至你完全理解用户的意图。当你完全理解用户的需求后，你需要分析并确认该项目的可行性和商业价值并告知用户。在用户让你开始设计实现方案前，你暂时不需要向用户提供具体的实现计划。你只需要告诉用户该需求能否被实现，实现过程中可能会遇到的风险或挑战，以及实现后预计用户可能获得的收益。最后你要提示用户点击对话框上方的“开始方案设计”按钮，让项目进入下一阶段。";
                break;
            case 'design':
                stagePrompt = "现在项目正处于方案设计阶段。用户已确认了项目的可行性，并希望你为他设计一套执行方案。你需要告诉用户实现此项目的大致流程，以及需要用到的技术，资源，花费或是其他必要的条件。如果用户提出建议，你要判断用户的意见是否有效，然后视情况更新方案并对用户进行反馈。你要向用户确认是否赞同你的方案，若用户赞同，你要明确提示他点击对话框上方的“生成任务”按钮，让项目进入下一阶段。";
                break;
            case 'planning':
                stagePrompt = "现在项目正处于任务规划阶段。用户已经同意了你的方案，并希望你将项目拆分成多个任务。" + employeeContext + "\n你必须按照用户（人类）和AI同事的能力，把项目拆分成合理的任务模块，并对任务模块进行命名，生成具体的任务描述，前置任务，以及安排最适合的AI同事(ai_id)或让用户执行。如果你没有适合的AI同事执行某项任务，则该项任务交予你自己或者用户完成。\n\nIMPORTANT INSTRUCTIONS FOR TASK GENERATION:\n1. 在完成任务生成后，你必须返回一个装载所有任务信息的json格式任务列表。\n2. 除此之外，不要回复任何其他东西。\n3. Output STRICTLY in a JSON block wrapped exactly in ```json-task-list ... ```.\n4. Each task MUST have a 'temp_id' (e.g., 't1', 't2') and a 'dependencies' array containing the temp_ids of prerequisite tasks.\nExample Format:\n```json-task-list\n[{\"temp_id\": \"t1\", \"title\": \"Task Title\", \"description\": \"Task description\", \"assignee_type\": \"human\" | \"predefinedAI\", \"ai_id\": 123, \"dependencies\": []}]\n```";
                break;
            case 'execution':
                stagePrompt = "现在项目正处于执行阶段。用户已经按照你的规划的任务开始推进项目，以后用户和你对话的时候你需要根据当前已有的任务和项目进展向用户提供建议。如果项目完成，提示用户点击顶部的“确认项目完成”按钮。";
                break;
            case 'maintenance':
                stagePrompt = "现在项目正处于后续开发阶段。该项目已经完成，但用户可能提出后续的修改需求。如果确认到用户需求，请分析并提供用户修改方案。如果用户同意方案，请提示用户点击顶部的“生成任务”按钮。";
                break;
        }
        return (basePrompt || '') + "\n\n[当前项目阶段系统指令]:\n" + stagePrompt;
    };

    const handleStageTransition = async () => {
        let nextStage = '';
        let triggerMessage = '';
        switch (projectStage) {
            case 'research':
                nextStage = 'design';
                triggerMessage = "[系统动作] 用户点击了“开始方案设计”，请立刻为用户设计一套执行方案。";
                break;
            case 'design':
            case 'maintenance':
                nextStage = 'planning';
                triggerMessage = "[系统动作] 用户点击了“生成任务”，请立即为你刚才设计的方案生成包含所有任务架构的特殊JSON区块返回，除此之外不要包含任何多余文字。";
                break;
            case 'execution':
                nextStage = 'maintenance';
                triggerMessage = "[系统动作] 用户点击了“确认项目完成”，项目进入后续开发阶段，请说一句简短的庆祝祝福语，并表明你会继续提供后续支持。";
                break;
        }
        if (nextStage) {
            setProjectStage(nextStage);
            await updateProjectStage(projectId, nextStage);
            await handleSendChat(triggerMessage, nextStage);
        }
    };

    const handleSendChat = async (overrideMsg?: string, forceStageContext?: string) => {
        const textToSend = overrideMsg || chatInput;
        if (!textToSend.trim()) return;

        if (!overrideMsg) {
            setChatInput('');
        }
        
        const newHistoryUser = [...chatHistory, { role: 'user' as const, content: textToSend }];
        setChatHistory(newHistoryUser);
        await updateProjectChatHistory(projectId, JSON.stringify(newHistoryUser));

        if (!manager || !manager.api_key) {
           setTimeout(async () => {
               const offlineHistory = [...newHistoryUser, { role: 'manager' as const, content: "I cannot assist you until you assign a valid AI Employee (with an API key) as the Project Manager for this project, or I will stay in offline sandbox mode." }];
               setChatHistory(offlineHistory);
               await updateProjectChatHistory(projectId, JSON.stringify(offlineHistory));
           }, 500);
           return;
        }

        setIsChatLoading(true);
        const effectiveStage = forceStageContext || projectStage;
        try {
            const allEmployees = await getEmployees();
            const employeeContext = allEmployees.length > 0 
                ? `\n\nAVAILABLE AI EMPLOYEES:\n${allEmployees.map(e => `- ID: ${e.id}, Name: ${e.name}, Role: ${e.role}, Model: ${e.model}`).join('\n')}\n\n`
                : `\n\nAVAILABLE AI EMPLOYEES: None.\n`;

            const messages: LLMMessage[] = [];
            messages.push({
                role: 'system',
                content: getSystemPromptForStage(effectiveStage, manager.system_prompt || '', employeeContext)
            });

            chatHistory.forEach(msg => messages.push({
                role: msg.role === 'manager' ? 'assistant' : 'user',
                content: msg.content
            }));

            messages.push({ role: 'user', content: textToSend });

            const response = await callLLM(manager.api_url, manager.api_key, manager.model, messages);
            
            const newHistoryResponse = [...newHistoryUser, { role: 'manager' as const, content: response }];
            setChatHistory(newHistoryResponse);
            await updateProjectChatHistory(projectId, JSON.stringify(newHistoryResponse));

            if (effectiveStage === 'planning') {
                const jsonMatch = response.match(/```json-task-list\n([\s\S]*?)\n```/);
                if (jsonMatch) {
                    try {
                        const parsedTasks = JSON.parse(jsonMatch[1]);
                        if (Array.isArray(parsedTasks)) {
                            const idMap = new Map<string, number>();

                            for (const t of parsedTasks) {
                                const newId = await saveTask({
                                    project_id: projectId,
                                    title: t.title || 'New Task',
                                    description: t.description || '',
                                    assignee_type: t.assignee_type || 'human',
                                    ai_id: t.ai_id || null,
                                    status: 'todo',
                                    parent_task_ids: '[]'
                                });
                                if (newId && t.temp_id) {
                                    idMap.set(t.temp_id, newId);
                                }
                                t._realId = newId;
                            }
                            
                            for (const t of parsedTasks) {
                                if (t._realId && t.dependencies && Array.isArray(t.dependencies) && t.dependencies.length > 0) {
                                    const realDeps = t.dependencies.map((dep: string) => idMap.get(dep)).filter(Boolean);
                                    if (realDeps.length > 0) {
                                        await saveTask({
                                            id: t._realId,
                                            project_id: projectId,
                                            title: t.title || 'New Task',
                                            description: t.description || '',
                                            assignee_type: t.assignee_type || 'human',
                                            ai_id: t.ai_id || null,
                                            status: 'todo',
                                            parent_task_ids: JSON.stringify(realDeps)
                                        });
                                    }
                                }
                            }
                            
                            loadTasks(); 

                            const successMsg = `✅ *System:* Successfully generated and linked ${parsedTasks.length} tasks based on the plan.`;
                            const finalHistory = [...newHistoryResponse, { role: 'manager' as const, content: successMsg }];
                            setChatHistory(finalHistory);
                            await updateProjectChatHistory(projectId, JSON.stringify(finalHistory));

                            // Auto advance to execution
                            setProjectStage('execution');
                            await updateProjectStage(projectId, 'execution');
                        }
                    } catch (e) {
                        console.error("Failed to parse tasks from JSON", e);
                    }
                } else {
                    if (window.confirm("任务生成失败，未在AI回复中检测到有效的JSON格式任务数据。是否让AI重新生成？")) {
                        setTimeout(() => {
                            handleSendChat("[系统警告] 你刚才输出了不符合规范的格式。你必须严格按照 ```json-task-list ... ``` 包裹且仅输出JSON。请重新生成！", 'planning');
                        }, 100);
                    } else {
                        // Revert to design if they cancel
                        setProjectStage('design');
                        await updateProjectStage(projectId, 'design');
                    }
                }
            }
        } catch (e: any) {
            console.error(e);
            const errorHistory = [...newHistoryUser, { role: 'manager' as const, content: `[API Error: ${e.message}]` }];
            setChatHistory(errorHistory);
            await updateProjectChatHistory(projectId, JSON.stringify(errorHistory));
        } finally {
            setIsChatLoading(false);
        }
    };

    const onNodeClick: NodeMouseHandler = (_, node) => {
        const ts = tasks.find(t => t.id?.toString() === node.id);
        if (ts) setSelectedTask(ts);
    };

    return (
        <div className="flex w-full h-full">
            {/* Left Pane - Chat Manager */}
            <div
                className="flex flex-col h-full bg-card z-10 shrink-0 border-r border-border relative"
                style={{ width: chatWidth }}
            >
                <div className="h-14 flex justify-between items-center px-4 border-b border-border shrink-0 bg-background/50">
                    <div className="font-bold text-sm text-foreground tracking-wider flex items-center gap-2">
                        <span>Project Manager</span>
                    </div>
                    <div>
                        {projectStage === 'research' && <button onClick={handleStageTransition} className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm text-xs px-3 py-1.5 rounded-md font-medium transition-colors">开始方案设计</button>}
                        {projectStage === 'design' && <button onClick={handleStageTransition} className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm text-xs px-3 py-1.5 rounded-md font-medium transition-colors">生成任务</button>}
                        {projectStage === 'planning' && <div className="text-xs text-muted-foreground animate-pulse font-medium bg-accent px-3 py-1.5 rounded-md">任务生成中...</div>}
                        {projectStage === 'execution' && <button onClick={handleStageTransition} className="bg-green-600 hover:bg-green-700 text-white shadow-sm text-xs px-3 py-1.5 rounded-md font-medium transition-colors">确认项目完成</button>}
                        {projectStage === 'maintenance' && <button onClick={handleStageTransition} className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm text-xs px-3 py-1.5 rounded-md font-medium transition-colors">生成新改动任务</button>}
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {chatHistory.map((msg, i) => (
                        <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                            <span className={`text-xs mb-1 text-muted-foreground ${msg.role === 'user' ? 'mr-1' : 'ml-1'}`}>
                                {msg.role === 'user' ? 'You' : 'Project Manager'}
                            </span>
                            <div className={`px-4 py-3 rounded-2xl max-w-[90%] text-sm ${msg.role === 'user'
                                ? 'bg-primary text-primary-foreground rounded-tr-sm'
                                : 'bg-accent text-accent-foreground rounded-tl-sm'
                                }`}>
                                {msg.role === 'manager' ? (
                                    <ReactMarkdown
                                        components={{
                                            ul: ({ node, ...props }) => <ul className="list-disc pl-4 space-y-1 mb-2" {...props} />,
                                            ol: ({ node, ...props }) => <ol className="list-decimal pl-4 space-y-1 mb-2" {...props} />,
                                            li: ({ node, ...props }) => <li {...props} />,
                                            p: ({ node, ...props }) => <p className="mb-2 last:mb-0 leading-relaxed" {...props} />,
                                            h1: ({ node, ...props }) => <h1 className="text-lg font-bold mb-2 mt-4" {...props} />,
                                            h2: ({ node, ...props }) => <h2 className="text-md font-bold mb-1 mt-3" {...props} />,
                                            h3: ({ node, ...props }) => <h3 className="text-sm font-bold mb-1 mt-2" {...props} />,
                                            pre: ({ node, ...props }) => <pre className="bg-background/50 p-2 rounded-md my-2 overflow-x-auto text-xs font-mono text-foreground" {...props} />,
                                            code: ({ node, inline, ...props }: any) => inline ? <code className="bg-background/50 px-1 py-0.5 rounded text-xs text-foreground" {...props} /> : <code {...props} />
                                        }}
                                    >
                                        {msg.content.replace(/```json-task-list\n[\s\S]*?\n```/g, '> 🗂️ *(Task generation JSON payload processed)*')}
                                    </ReactMarkdown>
                                ) : (
                                    <div className="whitespace-pre-wrap">{msg.content}</div>
                                )}
                            </div>
                        </div>
                    ))}
                    {isChatLoading && (
                        <div className="flex flex-col items-start">
                            <span className="text-xs mb-1 text-muted-foreground ml-1">Project Manager</span>
                            <div className="px-4 py-3 rounded-2xl bg-accent text-accent-foreground rounded-tl-sm flex items-center gap-2">
                                <Loader2 size={16} className="animate-spin" />
                                <span className="text-sm">Thinking...</span>
                            </div>
                        </div>
                    )}
                </div>

                <div className="p-4 border-t border-border bg-background shrink-0">
                    <div className="flex flex-col gap-2">
                        <textarea
                            className="w-full p-2 border border-border rounded-md bg-transparent text-sm resize-none custom-scrollbar focus:outline-none focus:ring-1 focus:ring-primary/50"
                            placeholder="Describe your workflow... (Shift+Enter for newline)"
                            rows={8}
                            value={chatInput}
                            onChange={e => setChatInput(e.target.value)}
                            onKeyDown={e => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    handleSendChat();
                                }
                            }}
                        />
                        <button
                            onClick={() => handleSendChat()}
                            disabled={isChatLoading || !chatInput.trim()}
                            className="bg-primary text-primary-foreground px-4 py-2 rounded-md font-medium hover:opacity-90 disabled:opacity-50 self-end transition-opacity"
                        >
                            Send
                        </button>
                    </div>
                </div>

                <div
                    className="absolute top-0 right-0 w-1.5 h-full cursor-col-resize hover:bg-primary transition-colors z-20 translate-x-[1px]"
                    onMouseDown={() => setIsDragging(true)}
                />
            </div>

            {/* Right Pane - Canvas Map & Kanban */}
            <div className="flex-1 flex flex-col h-full bg-background relative overflow-hidden">
                <div className="absolute top-4 left-4 z-10 bg-card border border-border rounded-md px-3 py-2 shadow-sm flex items-center gap-4">
                    <span className="font-semibold text-sm">Task View</span>
                    <div className="flex bg-accent/50 rounded-md p-1">
                        <button
                            onClick={() => setViewMode('graph')}
                            className={`p-1.5 rounded flex items-center gap-1 text-xs transition-colors ${viewMode === 'graph' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                        >
                            <Network size={14} /> Graph
                        </button>
                        <button
                            onClick={() => setViewMode('kanban')}
                            className={`p-1.5 rounded flex items-center gap-1 text-xs transition-colors ${viewMode === 'kanban' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                        >
                            <LayoutGrid size={14} /> Kanban
                        </button>
                    </div>
                    <button
                        onClick={() => setSelectedTask({ project_id: projectId, title: 'New Task', description: '', status: 'todo', assignee_type: 'human' })}
                        className="flex items-center gap-1 text-xs bg-primary text-primary-foreground px-2 py-1 rounded hover:opacity-90 transition-opacity ml-4"
                    >
                        <Plus size={14} /> Add Task
                    </button>
                </div>
                <div className="w-full h-full pt-16 pb-4 px-4 overflow-auto">
                    {viewMode === 'graph' ? (
                        <ReactFlow
                            nodes={nodes}
                            edges={edges}
                            onNodesChange={onNodesChange}
                            onEdgesChange={onEdgesChange}
                            onNodeClick={onNodeClick}
                            fitView
                            className="bg-background"
                        >
                            <Background color="currentColor" className="opacity-10 text-muted-foreground" gap={16} />
                            <Controls className="react-flow__controls-button" />
                        </ReactFlow>
                    ) : (
                        <div className="flex w-full h-full gap-4 overflow-x-auto pb-2">
                            {['todo', 'in-progress', 'pending-review', 'done'].map((colStatus) => (
                                <div key={colStatus} className="flex-1 min-w-[280px] bg-accent/20 rounded-lg border border-border flex flex-col h-full p-3">
                                    <div className="font-bold text-sm mb-3 px-2 uppercase tracking-wide text-muted-foreground flex justify-between items-center">
                                        {colStatus.replace('-', ' ')}
                                        <span className="bg-background px-2 py-0.5 rounded-full text-xs">
                                            {tasks.filter(t => t.status === colStatus).length}
                                        </span>
                                    </div>
                                    <div className="flex-1 overflow-y-auto space-y-3 px-1">
                                        {tasks.filter(t => t.status === colStatus).map(task => (
                                            <div
                                                key={task.id}
                                                onClick={() => setSelectedTask(task)}
                                                className="bg-card border border-border rounded-md p-3 shadow-sm cursor-pointer hover:border-primary/50 transition-colors group"
                                            >
                                                <div className="font-semibold text-sm mb-1 line-clamp-2">{task.title}</div>
                                                <div className="text-xs text-muted-foreground line-clamp-2">{task.description || 'No description'}</div>
                                                <div className="mt-3 pt-2 border-t border-border flex justify-between items-center text-xs">
                                                    <span className="font-medium px-1.5 py-0.5 rounded-sm bg-accent">{task.assignee_type}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {selectedTask && (
                <TaskModal
                    task={selectedTask}
                    allTasks={tasks}
                    onClose={() => setSelectedTask(null)}
                    onSaved={() => {
                        setSelectedTask(null);
                        loadTasks();
                    }}
                />
            )}
        </div>
    )
}
