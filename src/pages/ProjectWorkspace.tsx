import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { ReactFlow, Controls, Background, Node, Edge, applyNodeChanges, applyEdgeChanges, NodeChange, EdgeChange, NodeMouseHandler } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { WorkflowTask, getTasks, saveTask } from '../lib/tasks';
import { getProjectById, updateProjectChatHistory, updateProjectStage, updateProjectIsRunning } from '../lib/projects';
import { AIEmployee, getEmployeeById, getEmployees } from '../lib/employees';
import { getProjectInfos } from '../lib/project_info';
import { getProfessions } from '../lib/professions';
import { callLLM, LLMMessage } from '../lib/llm';
import TaskModal from '../components/TaskModal';
import ProjectInfoBoard from '../components/ProjectInfoBoard';
import { Plus, LayoutGrid, Network, Loader2, Play, Pause, FileText } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { invoke } from '@tauri-apps/api/core';
import { readTextFile } from '@tauri-apps/plugin-fs';
import { useTranslation } from '../lib/i18n';

const initialNodes: Node[] = [];
const initialEdges: Edge[] = [];

export default function ProjectWorkspace() {
    const { id } = useParams();
    const { t } = useTranslation();
    const projectId = parseInt(id || '0', 10);

    const [tasks, setTasks] = useState<WorkflowTask[]>([]);
    const [nodes, setNodes] = useState<Node[]>(initialNodes);
    const [edges, setEdges] = useState<Edge[]>(initialEdges);
    const [chatInput, setChatInput] = useState('');
    const [mainTab, setMainTab] = useState<'tasks' | 'info'>('tasks');
    const [viewMode, setViewMode] = useState<'graph' | 'kanban'>('graph');
    const [manager, setManager] = useState<AIEmployee | null>(null);
    const [isChatLoading, setIsChatLoading] = useState(false);
    const [projectStage, setProjectStage] = useState<string>('research');
    const [isRunning, setIsRunning] = useState(false);

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
                if (proj.is_running !== undefined) {
                    setIsRunning(proj.is_running === 1);
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

    const handleToggleExecution = async () => {
        const nextState = !isRunning;
        setIsRunning(nextState);
        await updateProjectIsRunning(projectId, nextState ? 1 : 0);
    };

    const parseAndSaveFiles = async (response: string, baseProjectPath: string) => {
        const fileRegex = /<file\s+path="([^"]+)">([\s\S]*?)<\/file>/g;
        let match;
        while ((match = fileRegex.exec(response)) !== null) {
            const relPath = match[1];
            const content = match[2];
            try {
                // Ensure base path doesn't have trailing slash and relPath doesn't have leading slash, standard join formatting.
                const cleanBase = baseProjectPath.replace(/[\\/]$/, '');
                const cleanRel = relPath.replace(/^[\\/]/, '');
                const absolutePath = `${cleanBase}/${cleanRel}`;
                await invoke('save_file', { absolutePath, content });
            } catch (e) {
                console.error("Auto execute failed to parse/save file:", e);
            }
        }
    };

    useEffect(() => {
        if (!isRunning || !projectId) return;

        const executeStep = async () => {
            try {
                const currentTasks = await getTasks(projectId);
                const proj = await getProjectById(projectId);
                if (!proj) return;
                
                const allEmployees = await getEmployees();
                const allInfos = await getProjectInfos(projectId);
                const allProfs = await getProfessions();
                
                for (const t of currentTasks) {
                    if (t.status === 'todo' && t.assignee_type !== 'human') {
                        let isReady = true;
                        if (t.parent_task_ids) {
                            try {
                                const parents = JSON.parse(t.parent_task_ids) as number[];
                                for (const pid of parents) {
                                    const parentTask = currentTasks.find(pt => pt.id === pid);
                                    if (!parentTask || parentTask.status !== 'done') {
                                        isReady = false;
                                        break;
                                    }
                                }
                            } catch(e) {}
                        }

                        if (isReady) {
                            // Start processing this task
                            await saveTask({ ...t, status: 'in-progress' });
                            loadTasks(); // refresh UI immediately
                            
                            let apiUrl = '';
                            let apiKey = '';
                            let model = '';
                            let sysPrompt = '';
                            let isConfigValid = false;

                            if (t.assignee_type === 'predefinedAI') {
                                const emp = allEmployees.find(e => e.id === t.ai_id);
                                if (emp) {
                                    apiUrl = emp.api_url;
                                    apiKey = emp.api_key;
                                    model = emp.model;
                                    sysPrompt = emp.system_prompt || '';
                                    
                                    const prof = allProfs.find(p => p.name === emp.role);
                                    const relevantInfos = allInfos.filter(info => info.target_profession_id === null || info.target_profession_id === prof?.id);
                                    if (relevantInfos.length > 0) {
                                        sysPrompt += '\n\n[Project Information Base Context]\n';
                                        relevantInfos.forEach(info => {
                                            sysPrompt += `--- ${info.name} ---\n${info.content}\n\n`;
                                        });
                                    }

                                    if (emp.skill_path) {
                                        try {
                                            const skillData = await readTextFile(emp.skill_path);
                                            sysPrompt += `\n\n[Skill Knowledge Base]\n${skillData}`;
                                        } catch(e) { console.error("Could not load skill file", e); }
                                    }
                                    isConfigValid = true;
                                }
                            } else if (t.assignee_type === 'customAI' && t.custom_api_config) {
                                try {
                                    const conf = JSON.parse(t.custom_api_config);
                                    apiUrl = conf.apiUrl;
                                    apiKey = conf.apiKey;
                                    model = conf.model;
                                    sysPrompt = conf.systemPrompt || '';
                                    isConfigValid = !!apiUrl;
                                } catch (e) {}
                            }

                            if (!isConfigValid) {
                                await saveTask({ ...t, status: 'todo' }); // Revert
                                continue;
                            }

                            let chatHistory: any[] = [];
                            if (t.chat_history) {
                                try { chatHistory = JSON.parse(t.chat_history); } catch(e){}
                            }

                            if (chatHistory.length === 0) {
                                const initialPrompt = `[Initial Project Manager Prompt / 强制系统指令]\nRole Context: \n${sysPrompt}\n\nTask Assigned:\nTitle: ${t.title}\nDescription: ${t.description}\n\nProject Local Save Path: ${proj.save_path || 'Unknown'}\n\nINSTRUCTIONS FOR FILE OUTPUT:\nWhen outputting code or content that should be saved to a file, NEVER just output it in chat. You MUST output it strictly wrapped in a special XML-like tag format so the system can parse and save it automatically. Format:\n<file path="relative/path/from/project/root/filename.extension">\nYOUR_CODE_OR_CONTENT_HERE\n</file>\n\nIf you don't know where to put it, create standard structural directories like 'src/components', 'docs/', or 'scripts/' inside the project automatically based on your expertise. Provide a brief chat summary after the file blocks.`;
                                chatHistory.push({ role: 'system', content: initialPrompt });
                                chatHistory.push({ role: 'user', content: 'Please start executing this task now based on your constraints and context.' });
                            } else {
                                chatHistory.push({ role: 'user', content: '[System Automaton Trigger] Please continue/start executing this task.' });
                            }

                            try {
                                const response = await callLLM(apiUrl, apiKey, model, chatHistory as LLMMessage[]);
                                chatHistory.push({ role: 'assistant', content: response });
                                
                                if (proj.save_path) {
                                    await parseAndSaveFiles(response, proj.save_path);
                                }
                                
                                await saveTask({ 
                                    ...t, 
                                    status: 'pending-review', 
                                    chat_history: JSON.stringify(chatHistory),
                                    deliverables: t.deliverables ? t.deliverables + '\n\n---\n' + response : response
                                });

                            } catch (e: any) {
                                console.error("Auto execute task LLM error:", e);
                                chatHistory.push({ role: 'assistant', content: `[API Error during auto-execution: ${e.message}]` });
                                await saveTask({ ...t, status: 'todo', chat_history: JSON.stringify(chatHistory) });
                            }

                            loadTasks();
                            break; // Stop loop and wait for next tick to run next task sequentially
                        }
                    }
                }
            } catch (e) {
                console.error("Execution loop error:", e);
            }
        };

        const interval = setInterval(executeStep, 5000);
        return () => clearInterval(interval);
    }, [isRunning, projectId]);

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
                stagePrompt = t('pm_role_research');
                break;
            case 'design':
                stagePrompt = t('pm_role_design');
                break;
            case 'planning':
                stagePrompt = t('pm_role_planning') + employeeContext + "\n你必须按照用户（人类）和AI同事的能力，把项目拆分成合理的任务模块，并对任务模块进行命名，生成具体的任务描述，前置任务，以及安排最适合的AI同事(ai_id)或让用户执行。如果你没有适合的AI同事执行某项任务，则该项任务交予你自己或者用户完成。\n\nIMPORTANT INSTRUCTIONS FOR TASK GENERATION:\n1. 在完成任务生成后，你必须返回一个装载所有任务信息的json格式任务列表。\n2. 除此之外，不要回复任何其他东西。\n3. Output STRICTLY in a JSON block wrapped exactly in ```json-task-list ... ```.\n4. Each task MUST have a 'temp_id' (e.g., 't1', 't2') and a 'dependencies' array containing the temp_ids of prerequisite tasks.\nExample Format:\n```json-task-list\n[{\"temp_id\": \"t1\", \"title\": \"Task Title\", \"description\": \"Task description\", \"assignee_type\": \"human\" | \"predefinedAI\", \"ai_id\": 123, \"dependencies\": []}]\n```";
                break;
            case 'execution':
                stagePrompt = t('pm_role_execution');
                break;
            case 'maintenance':
                stagePrompt = t('pm_role_maintenance');
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
                triggerMessage = t('pm_trigger_design');
                break;
            case 'design':
            case 'maintenance':
                nextStage = 'planning';
                triggerMessage = t('pm_trigger_planning');
                break;
            case 'execution':
                nextStage = 'maintenance';
                triggerMessage = t('pm_trigger_maintenance');
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
            
            let pmSystemPrompt = getSystemPromptForStage(effectiveStage, manager.system_prompt || '', employeeContext);
            if (manager.skill_path) {
                try {
                    const skillData = await readTextFile(manager.skill_path);
                    pmSystemPrompt += `\n\n[Skill Knowledge Base]\n${skillData}`;
                } catch(e) { console.error("Could not load PM skill file", e) }
            }

            messages.push({
                role: 'system',
                content: pmSystemPrompt
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

                            const successMsg = t('pm_task_generation_success');
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
                    if (window.confirm(t('pm_task_generation_failed_confirm_retry'))) {
                        setTimeout(() => {
                            handleSendChat(t('pm_task_generation_retry_prompt'), 'planning');
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

    const handleAddTaskClick = () => {
        setSelectedTask({ project_id: projectId, title: t('new_task_title'), description: '', status: 'todo', assignee_type: 'human' });
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendChat();
        }
    };

    const getStageName = (stage: string) => {
        switch (stage) {
            case 'research': return t('stage_research');
            case 'design': return t('stage_design');
            case 'planning': return t('stage_planning');
            case 'execution': return t('stage_execution');
            case 'maintenance': return t('stage_maintenance');
            default: return stage;
        }
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
                        <span>{t('project_manager')}</span>
                    </div>
                    <div>
                        {projectStage === 'research' && <button onClick={handleStageTransition} className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm text-xs px-3 py-1.5 rounded-md font-medium transition-colors">{t('btn_start_design')}</button>}
                        {projectStage === 'design' && <button onClick={handleStageTransition} className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm text-xs px-3 py-1.5 rounded-md font-medium transition-colors">{t('btn_generate_tasks')}</button>}
                        {projectStage === 'planning' && <div className="text-xs text-muted-foreground animate-pulse font-medium bg-accent px-3 py-1.5 rounded-md">{t('btn_generating_tasks')}</div>}
                        {projectStage === 'execution' && <button onClick={handleStageTransition} className="bg-green-600 hover:bg-green-700 text-white shadow-sm text-xs px-3 py-1.5 rounded-md font-medium transition-colors">{t('btn_confirm_complete')}</button>}
                        {projectStage === 'maintenance' && <button onClick={handleStageTransition} className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm text-xs px-3 py-1.5 rounded-md font-medium transition-colors">{t('btn_generate_new_tasks')}</button>}
                    </div>
                </div>

                <div className="h-full flex flex-col bg-card border-r border-border min-w-[360px] max-w-[400px]">
                    <div className="p-4 border-b border-border bg-accent/30 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold">
                            {manager ? manager.name.charAt(0) : 'PM'}
                        </div>
                        <div>
                            <h2 className="font-bold text-lg">{manager?.name || t('ws_pm')}</h2>
                            <p className="text-xs text-muted-foreground flex items-center gap-2">
                                <span className="px-2 py-0.5 rounded-full bg-background border border-border">
                                    {getStageName(projectStage)}
                                </span>
                            </p>
                        </div>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {chatHistory.map((msg, i) => (
                        <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                            <span className={`text-xs mb-1 text-muted-foreground ${msg.role === 'user' ? 'mr-1' : 'ml-1'}`}>
                                {msg.role === 'user' ? t('you') : t('project_manager')}
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
                                        {msg.content.replace(/```json-task-list\n([\s\S]*?)\n```/g, '> 🗂️ *(Task generation JSON payload processed)*')}
                                    </ReactMarkdown>
                                ) : (
                                    <div className="whitespace-pre-wrap">{msg.content}</div>
                                )}
                            </div>
                        </div>
                    ))}
                    {isChatLoading && (
                        <div className="flex flex-col items-start">
                            <span className="text-xs mb-1 text-muted-foreground ml-1">{t('project_manager')}</span>
                            <div className="px-4 py-3 rounded-2xl bg-accent text-accent-foreground rounded-tl-sm flex items-center gap-2">
                                <Loader2 size={16} className="animate-spin" />
                                <span className="text-sm">{t('ai_thinking')}</span>
                            </div>
                        </div>
                    )}
                </div>

                <div className="p-4 border-t border-border bg-background shrink-0">
                    <div className="flex flex-col gap-2">
                        <textarea
                            value={chatInput}
                            onChange={(e) => setChatInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            disabled={isChatLoading || isRunning}
                            className="w-full bg-transparent border-none outline-none resize-none text-sm placeholder:text-muted-foreground/60 focus:ring-0"
                            placeholder={isRunning ? t('ws_running_placeholder') : t('ws_chat_ph')}
                            rows={8}
                        />
                        <div className="flex justify-between items-center mt-2 border-t border-border/50 pt-2">
                            <div className="text-xs text-muted-foreground">
                                {isChatLoading ? t('ai_thinking') : null}
                            </div>
                            <button
                                onClick={() => handleSendChat()}
                                disabled={isChatLoading || !chatInput.trim() || isRunning}
                                className="bg-primary text-primary-foreground px-4 py-1.5 rounded-md text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-2"
                            >
                                {isChatLoading ? <Loader2 size={14} className="animate-spin" /> : null}
                                {t('ws_chat_send')}
                            </button>
                        </div>
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
                    <div className="flex bg-accent/50 rounded-md p-1 mr-2">
                        <button
                            onClick={() => setMainTab('tasks')}
                            className={`p-1.5 px-3 rounded flex items-center gap-2 text-xs font-semibold transition-colors ${mainTab === 'tasks' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                        >
                            <Network size={14} /> {t('ws_tab_tasks')}
                        </button>
                        <button
                            onClick={() => setMainTab('info')}
                            className={`p-1.5 px-3 rounded flex items-center gap-2 text-xs font-semibold transition-colors ${mainTab === 'info' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                        >
                            <FileText size={14} /> {t('ws_tab_info')}
                        </button>
                    </div>
                    
                    {mainTab === 'tasks' && (
                        <>
                            <div className="flex bg-accent/50 rounded-md p-1 border-l border-border pl-2 ml-2">
                                <button
                                    onClick={() => setViewMode('graph')}
                                    className={`p-1.5 rounded flex items-center gap-1 text-xs transition-colors ${viewMode === 'graph' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                                >
                                    <Network size={14} /> {t('ws_graph')}
                                </button>
                                <button
                                    onClick={() => setViewMode('kanban')}
                                    className={`p-1.5 rounded flex items-center gap-1 text-xs transition-colors ${viewMode === 'kanban' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                                >
                                    <LayoutGrid size={14} /> {t('ws_kanban')}
                                </button>
                            </div>
                            <div className="flex items-center gap-2 border-l border-border pl-4">
                                <button
                                    onClick={handleToggleExecution}
                                    className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded font-medium shadow-sm transition-colors ${isRunning ? 'bg-amber-500 hover:bg-amber-600 text-white' : 'bg-green-600 hover:bg-green-700 text-white'}`}
                                >
                                    {isRunning ? <><Pause size={14}/> {t('ws_pause_proj')}</> : <><Play size={14}/> {t('ws_start_proj')}</>}
                                </button>
                            </div>
                            <button
                                onClick={handleAddTaskClick}
                                className="flex items-center gap-1 text-xs bg-primary text-primary-foreground px-2 py-1 rounded hover:opacity-90 transition-opacity ml-4"
                            >
                                <Plus size={14} /> {t('ws_add_task')}
                            </button>
                        </>
                    )}
                </div>
                <div className="w-full h-full pt-16 pb-4 px-4 overflow-auto">
                    {mainTab === 'info' ? (
                        <ProjectInfoBoard projectId={projectId} />
                    ) : viewMode === 'graph' ? (
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
