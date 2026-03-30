import { useState, useEffect } from 'react';
import { WorkflowTask, saveTask, deleteTask } from '../lib/tasks';
import { AIEmployee, getEmployees } from '../lib/employees';
import { ProjectInfo, getProjectInfos } from '../lib/project_info';
import { Profession, getProfessions } from '../lib/professions';
import { callLLM, LLMMessage } from '../lib/llm';
import { isCommandAllowed, autoGitSnapshot, executeShellCommand } from '../lib/shell';
import { X, Save, Paperclip, Bot, User, Plus, Trash2, Loader2, MessageSquare, AlertTriangle, CheckCircle } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { getProjectById } from '../lib/projects';
import { readTextFile } from '@tauri-apps/plugin-fs';
import { invoke } from '@tauri-apps/api/core';
import { useTranslation } from '../lib/i18n';

interface TaskModalProps {
    task: WorkflowTask;
    allTasks: WorkflowTask[];
    onClose: () => void;
    onSaved: () => void;
}

export default function TaskModal({ task, allTasks, onClose, onSaved }: TaskModalProps) {
    const { t } = useTranslation();
    const [formData, setFormData] = useState<WorkflowTask>(task);
    const [employees, setEmployees] = useState<AIEmployee[]>([]);
    const [customApiConfig, setCustomApiConfig] = useState({ apiUrl: '', apiKey: '', model: '', systemPrompt: '' });
    const [assets, setAssets] = useState<string[]>([]); // simplified asset repeater
    const [parentIds, setParentIds] = useState<number[]>([]);
    const [projectInfos, setProjectInfos] = useState<ProjectInfo[]>([]);
    const [professions, setProfessions] = useState<Profession[]>([]);
    
    // Chat state
    const [chatHistory, setChatHistory] = useState<{ role: 'user' | 'assistant' | 'system', content: string }[]>([]);
    const [chatInput, setChatInput] = useState('');
    const [isChatLoading, setIsChatLoading] = useState(false);
    const [pendingDangerousCommand, setPendingDangerousCommand] = useState<string | null>(null);
    const [projectPath, setProjectPath] = useState<string>('');

    useEffect(() => {
        getEmployees().then(setEmployees);
        getProjectInfos(task.project_id).then(setProjectInfos);
        getProfessions().then(setProfessions);
        getProjectById(task.project_id).then(p => setProjectPath(p?.save_path || ''));
        if (task.custom_api_config) {
            try { setCustomApiConfig(JSON.parse(task.custom_api_config)); } catch (e) { }
        }
        if (task.parent_task_ids) {
            try { setParentIds(JSON.parse(task.parent_task_ids)); } catch (e) { }
        }
        if (task.chat_history) {
            try { 
                setChatHistory(JSON.parse(task.chat_history)); 
            } catch (e) { }
        }
        // Load local assets in a real app via another DB call. Mocked here.
    }, [task]);

    const handleSave = async (silent = false) => {
        if (formData.assignee_type === 'customAI') {
            formData.custom_api_config = JSON.stringify(customApiConfig);
        } else if (formData.assignee_type === 'predefinedAI') {
            const emp = employees.find(e => e.id === formData.ai_id);
            if (emp && emp.api_url === 'ComfyUI' && customApiConfig.systemPrompt) {
                formData.custom_api_config = JSON.stringify({ systemPrompt: customApiConfig.systemPrompt });
            } else {
                formData.custom_api_config = null;
            }
        } else {
            formData.custom_api_config = null;
        }
        formData.parent_task_ids = JSON.stringify(parentIds);
        formData.chat_history = JSON.stringify(chatHistory);
        await saveTask(formData);
        
        if (!silent) {
            onSaved();
            onClose();
        }
    };

    const handleDelete = async () => {
        if (!formData.id) return;
        if (confirm('Are you sure you want to delete this task?')) {
            await deleteTask(formData.id);
            onSaved();
            onClose();
        }
    };

    const getInitialSystemPrompt = async () => {
        let sysPrompt = '';
        if (formData.assignee_type === 'predefinedAI') {
            const emp = employees.find(e => e.id === formData.ai_id);
            if (emp) {
                sysPrompt = emp.system_prompt;

                const prof = professions.find(p => p.name === emp.role);
                const relevantInfos = projectInfos.filter(info => info.target_profession_id === null || info.target_profession_id === prof?.id);
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
            }
        } else if (formData.assignee_type === 'customAI') {
            sysPrompt = customApiConfig.systemPrompt;
        }
        return `[Initial Project Manager Prompt / 强制系统指令]\nRole Context: \n${sysPrompt}\n\nTask Assigned:\nTitle: ${formData.title}\nDescription: ${formData.description}\n\nProject Local Save Path: ${projectPath}\n\nINSTRUCTIONS FOR FILE OUTPUT:\nWhen outputting code or content that should be saved to a file, NEVER just output it in chat. You MUST output it strictly wrapped in a special XML-like tag format so the system can parse and save it automatically. Format:\n<file path="relative/path/from/project/root/filename.extension">\nYOUR_CODE_OR_CONTENT_HERE\n</file>\n\nIf you don't know where to put it, create standard structural directories like 'src/components', 'docs/', or 'scripts/' inside the project automatically based on your expertise. Provide a brief chat summary after the file blocks.`;
    };

    const executeAndContinue = async (cmd: string, currentHistory: { role: 'user' | 'assistant' | 'system', content: string }[]) => {
        setIsChatLoading(true);
        setPendingDangerousCommand(null);
        try {
            await autoGitSnapshot(projectPath);
            const out = await executeShellCommand(cmd, projectPath);
            const sysMsg = { role: 'system' as const, content: `[Command Execution Result]\n${out}` };
            currentHistory.push(sysMsg);
            setChatHistory([...currentHistory]);
            await getAIResponse(currentHistory);
        } catch(e: any) {
            currentHistory.push({ role: 'system' as const, content: `[Execution Error]\n${e.message}` });
            setChatHistory([...currentHistory]);
            await getAIResponse(currentHistory);
        }
    };

    const rejectAndContinue = async (currentHistory: { role: 'user' | 'assistant' | 'system', content: string }[]) => {
        setPendingDangerousCommand(null);
        currentHistory.push({ role: 'system' as const, content: `[System]: The user REJECTED the execution of the previous command. Please explain why you needed it or try another approach.` });
        setChatHistory([...currentHistory]);
        await getAIResponse(currentHistory);
    };

    const getAIResponse = async (history: { role: 'user' | 'assistant' | 'system', content: string }[]) => {
        setIsChatLoading(true);
        setPendingDangerousCommand(null);

        try {
            let apiUrl = '';
            let apiKey = '';
            let model = '';

            if (formData.assignee_type === 'predefinedAI') {
                const emp = employees.find(e => e.id === formData.ai_id);
                if (!emp) throw new Error("Please select a predefined AI Employee first.");
                apiUrl = emp.api_url;
                apiKey = emp.api_key;
                model = emp.model;
            } else if (formData.assignee_type === 'customAI') {
                apiUrl = customApiConfig.apiUrl;
                apiKey = customApiConfig.apiKey;
                model = customApiConfig.model;
                if (!apiUrl) throw new Error("Please provide a custom API Provider/URL.");
            } else {
                throw new Error("Cannot execute AI for a Human assigned task.");
            }

            const response = await callLLM(apiUrl, apiKey, model, history as LLMMessage[]);
            
            history.push({ role: 'assistant', content: response });
            setChatHistory([...history]);
            
            // Check for run_cmd pattern
            const match = response.match(/<run_cmd>(.*?)<\/run_cmd>/s);
            if (match) {
                const cmd = match[1].trim();
                if (isCommandAllowed(cmd)) {
                    // Auto-execute if greenlisted
                    await executeAndContinue(cmd, history);
                    return; // Early return because executeAndContinue will loop
                } else {
                    // Yellow-list: Pause and wait for manual approval
                    setPendingDangerousCommand(cmd);
                }
            }

            // Parse and save files locally
            if (projectPath) {
                const fileRegex = /<file\s+path="([^"]+)">([\s\S]*?)<\/file>/g;
                let m;
                while ((m = fileRegex.exec(response)) !== null) {
                    const cleanBase = projectPath.replace(/[\\/]$/, '');
                    const cleanRel = m[1].replace(/^[\\/]/, '');
                    const absolutePath = `${cleanBase}/${cleanRel}`;
                    try { await invoke('save_file', { absolutePath, content: m[2] }); } catch(e){}
                }

                const b64Regex = /<file_b64\s+path="([^"]+)">([\s\S]*?)<\/file_b64>/g;
                while ((m = b64Regex.exec(response)) !== null) {
                    try {
                        const parts = m[1].split(/[\\/]/);
                        const fileName = parts.pop() || 'image.png';
                        const fileType = parts.join('/') || 'images';
                        await invoke('save_asset', { projectPath, fileType, fileName, base64Data: m[2].trim() });
                    } catch(e){}
                }
            }

            // Save history
            const updatedTask = { ...formData, chat_history: JSON.stringify(history) };
            setFormData(updatedTask);
            await saveTask(updatedTask);
        } catch (e: any) {
            console.error(e);
            const errorMsg = { role: 'assistant' as const, content: `[API Error: ${e.message}]` };
            history.push(errorMsg);
            setChatHistory([...history]);
        } finally {
            if (!history[history.length - 1].content.match(/<run_cmd>(.*?)<\/run_cmd>/s) || isCommandAllowed(history[history.length - 1].content.match(/<run_cmd>(.*?)<\/run_cmd>/s)?.[1] || '')) {
                setIsChatLoading(false);
            } else {
                 setIsChatLoading(false); // Make sure to stop loading if waiting for approval
            }
        }
    };

    const handleSendChat = async () => {
        if (!chatInput.trim()) return;
        setIsChatLoading(true);
        
        let currentHistory = [...chatHistory];
        if (currentHistory.length === 0) {
            currentHistory.push({ role: 'system', content: await getInitialSystemPrompt() });
        }

        const userMsg = { role: 'user' as const, content: chatInput };
        currentHistory.push(userMsg);
        
        setChatHistory(currentHistory);
        setChatInput('');

        await getAIResponse(currentHistory);
    };

    const isAI = formData.assignee_type !== 'human';

    return (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 shrink-0">
            <div className={`bg-card w-full ${isAI ? 'max-w-6xl' : 'max-w-2xl'} h-[90vh] flex flex-col rounded-lg border border-border shadow-2xl relative`}>
                <div className="p-4 border-b border-border flex justify-between items-center bg-accent/30">
                    <h2 className="text-xl font-bold flex-1 mr-4">
                        <input
                            className="w-full bg-transparent border-b border-transparent hover:border-border focus:border-border outline-none"
                            value={formData.title}
                            onChange={e => setFormData({ ...formData, title: e.target.value })}
                            placeholder={t('task_title_ph')}
                        />
                    </h2>
                    <button onClick={onClose} className="p-1 hover:bg-accent rounded-md"><X size={20} /></button>
                </div>

                <div className="flex-1 flex overflow-hidden min-h-0">
                    {/* Left Pane: Config */}
                    <div className={`${isAI ? 'w-1/2 border-r border-border' : 'w-full'} flex flex-col overflow-y-auto p-6 space-y-6`}>
                        <div>
                            <label className="text-sm font-semibold mb-1 block">{t('task_desc')}</label>
                            <textarea
                                className="w-full p-3 border border-border rounded-md bg-transparent min-h-[100px] text-sm custom-scrollbar"
                                value={formData.description}
                                onChange={e => setFormData({ ...formData, description: e.target.value })}
                                placeholder={t('task_desc_ph')}
                            />
                        </div>

                        <div className="p-4 bg-background border border-border rounded-md space-y-3">
                            <h3 className="font-semibold text-sm border-b border-border pb-2">{t('task_parent_deps')}</h3>
                            <div className="flex flex-wrap gap-2 text-sm">
                                {allTasks.filter(t => t.id !== formData.id).map(t => (
                                    <label key={t.id} className="flex items-center gap-1.5 cursor-pointer bg-accent/50 px-2 py-1 rounded-md border border-border">
                                        <input
                                            type="checkbox"
                                            checked={parentIds.includes(t.id!)}
                                            onChange={(e) => {
                                                if (e.target.checked) setParentIds([...parentIds, t.id!]);
                                                else setParentIds(parentIds.filter(id => id !== t.id));
                                            }}
                                        />
                                        {t.title}
                                    </label>
                                ))}
                                {allTasks.filter(t => t.id !== formData.id).length === 0 && (
                                    <span className="text-muted-foreground text-xs">{t('task_no_deps')}</span>
                                )}
                            </div>
                        </div>

                        <div className="p-4 bg-background border border-border rounded-md space-y-4">
                            <h3 className="font-semibold text-sm border-b border-border pb-2">{t('task_assignment')}</h3>

                            <div className="flex gap-4">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input type="radio" checked={formData.assignee_type === 'human'} onChange={() => { setFormData({ ...formData, assignee_type: 'human' }); setChatHistory([]); }} />
                                    <User size={16} /> {t('task_assign_human')}
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input type="radio" checked={formData.assignee_type === 'predefinedAI'} onChange={() => { setFormData({ ...formData, assignee_type: 'predefinedAI' }); setChatHistory([]); }} />
                                    <Bot size={16} /> {t('task_assign_predefined')}
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input type="radio" checked={formData.assignee_type === 'customAI'} onChange={() => { setFormData({ ...formData, assignee_type: 'customAI' }); setChatHistory([]); }} />
                                    <Bot size={16} className="text-primary" /> {t('task_assign_custom')}
                                </label>
                            </div>

                            {formData.assignee_type === 'predefinedAI' && (
                                <>
                                    <select
                                        className="w-full p-2 border border-border rounded-md bg-transparent text-sm"
                                        value={formData.ai_id || ''}
                                        onChange={e => { setFormData({ ...formData, ai_id: Number(e.target.value) }); setChatHistory([]); }}
                                    >
                                        <option value="">{t('task_select_ai')}</option>
                                        {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name} ({emp.role})</option>)}
                                    </select>
                                    
                                    {formData.ai_id && employees.find(e => e.id === formData.ai_id)?.api_url === 'ComfyUI' && (
                                        <div className="mt-2">
                                            <textarea className="w-full p-2 border border-border rounded-md bg-transparent min-h-[160px] text-sm custom-scrollbar" placeholder={t('task_override_workflow')} value={customApiConfig.systemPrompt} onChange={e => setCustomApiConfig({ ...customApiConfig, systemPrompt: e.target.value })} />
                                        </div>
                                    )}
                                </>
                            )}

                            {formData.assignee_type === 'customAI' && (
                                <div className="space-y-3 bg-accent/20 p-3 rounded-md border border-border mt-2">
                                    <div className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-2">{t('task_custom_sandbox')}</div>
                                    <select className="w-full p-2 border border-border rounded-md bg-transparent text-sm" value={customApiConfig.apiUrl} onChange={e => setCustomApiConfig({ ...customApiConfig, apiUrl: e.target.value })}>
                                        <option value="" disabled>-- Select API Provider --</option>
                                        <option value="OpenAI/LM Studio">OpenAI/LM Studio</option>
                                        <option value="Google">Google</option>
                                        <option value="Groq">Groq</option>
                                        <option value="ComfyUI">ComfyUI</option>
                                    </select>
                                    <input className="w-full p-2 border border-border rounded-md bg-transparent text-sm" placeholder={t('task_api_key_ph')} type="password" value={customApiConfig.apiKey} onChange={e => setCustomApiConfig({ ...customApiConfig, apiKey: e.target.value })} />
                                    <input className="w-full p-2 border border-border rounded-md bg-transparent text-sm" placeholder={t('task_model_ph')} value={customApiConfig.model} onChange={e => setCustomApiConfig({ ...customApiConfig, model: e.target.value })} />
                                    <textarea className="w-full p-2 border border-border rounded-md bg-transparent text-sm min-h-[120px]" placeholder={customApiConfig.apiUrl === 'ComfyUI' ? t('task_override_workflow') : t('task_prompt_ph')} value={customApiConfig.systemPrompt} onChange={e => setCustomApiConfig({ ...customApiConfig, systemPrompt: e.target.value })} />
                                </div>
                            )}
                        </div>

                        <div className="space-y-2">
                            <h3 className="font-semibold text-sm flex justify-between items-center">
                                <span>{t('task_assets_title')}</span>
                                <button
                                    onClick={() => setAssets([...assets, ''])}
                                    className="text-xs flex items-center gap-1 text-primary hover:underline hover:opacity-80"
                                >
                                    <Plus size={12} /> {t('task_add_path')}
                                </button>
                            </h3>
                            {assets.map((path, idx) => (
                                <div key={idx} className="flex gap-2">
                                    <Paperclip size={18} className="text-muted-foreground mt-2 shrink-0" />
                                    <input
                                        className="flex-1 p-2 border border-border rounded-md bg-transparent text-sm"
                                        placeholder={t('task_path_ph')}
                                        value={path}
                                        onChange={e => {
                                            const newAs = [...assets];
                                            newAs[idx] = e.target.value;
                                            setAssets(newAs);
                                        }}
                                    />
                                    <button onClick={() => setAssets(assets.filter((_, i) => i !== idx))} className="p-2 text-destructive"><X size={16} /></button>
                                </div>
                            ))}
                            {assets.length === 0 && <p className="text-xs text-muted-foreground">{t('task_no_assets')}</p>}
                        </div>

                        {!isAI && (
                            <div>
                                <label className="text-sm font-semibold block mb-1">{t('task_deliverables_title')}</label>
                                <textarea
                                    className="w-full p-3 border border-primary/20 rounded-md bg-accent/10 min-h-[150px] text-sm custom-scrollbar"
                                    value={formData.deliverables || ''}
                                    onChange={e => setFormData({ ...formData, deliverables: e.target.value })}
                                    placeholder={t('task_deliverables_ph')}
                                />
                            </div>
                        )}
                    </div>

                    {/* Right Pane: Chat Window (Only for AI) */}
                    {isAI && (
                        <div className="w-1/2 flex flex-col bg-background relative shrink-0">
                            <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                                {chatHistory.length === 0 && (
                                    <div className="h-full flex flex-col items-center justify-center text-muted-foreground space-y-3 opacity-60">
                                        <MessageSquare size={48} className="text-primary/50" />
                                        <p className="text-sm">{t('task_no_chat')}</p>
                                        <button onClick={async () => setChatHistory([{ role: 'system', content: await getInitialSystemPrompt() }])} className="px-4 py-2 bg-accent rounded text-xs hover:bg-accent/80 transition-colors">
                                            {t('task_view_prompt')}
                                        </button>
                                    </div>
                                )}
                                {chatHistory.map((msg, i) => (
                                    <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                                        <span className={`text-xs mb-1 text-muted-foreground ${msg.role === 'user' ? 'mr-1' : 'ml-1'} flex items-center gap-1`}>
                                            {msg.role === 'user' ? t('you') : msg.role === 'system' ? <><Bot size={12}/> {t('task_initial_prompt')}</> : t('task_ai_assignee')}
                                        </span>
                                        <div className={`px-4 py-3 rounded-2xl max-w-[95%] text-sm ${
                                            msg.role === 'user'
                                            ? 'bg-primary text-primary-foreground rounded-tr-sm'
                                            : msg.role === 'system'
                                            ? 'bg-amber-900/20 text-amber-500 rounded-tl-sm border border-amber-900/30 font-mono text-xs whitespace-pre-wrap'
                                            : 'bg-accent text-accent-foreground rounded-tl-sm'
                                            }`}>
                                            {msg.role === 'system' ? (
                                                msg.content
                                            ) : (
                                                <ReactMarkdown
                                                    components={{
                                                        ul: ({ node, ...props }) => <ul className="list-disc pl-4 space-y-1 mb-2" {...props} />,
                                                        ol: ({ node, ...props }) => <ol className="list-decimal pl-4 space-y-1 mb-2" {...props} />,
                                                        li: ({ node, ...props }) => <li {...props} />,
                                                        p: ({ node, ...props }) => <p className="mb-2 last:mb-0 leading-relaxed" {...props} />,
                                                        pre: ({ node, ...props }) => <pre className="bg-background/50 p-2 rounded-md my-2 overflow-x-auto text-xs font-mono text-foreground" {...props} />,
                                                        code: ({ node, inline, ...props }: any) => inline ? <code className="bg-background/50 px-1 py-0.5 rounded text-xs text-foreground" {...props} /> : <code {...props} />
                                                    }}
                                                >
                                                    {msg.content.replace(/<file[\s\S]*?>[\s\S]*?<\/file>/g, '> 💾 *(Generated a file block)*').replace(/<run_cmd>[\s\S]*?<\/run_cmd>/g, '> ⚡ *(Requested Terminal Command)*')}
                                                </ReactMarkdown>
                                            )}
                                        </div>
                                    </div>
                                ))}
                                {pendingDangerousCommand && (
                                    <div className="flex flex-col items-start mt-2">
                                        <div className="px-4 py-4 rounded-xl max-w-[95%] bg-amber-500/10 border border-amber-500/30">
                                            <div className="flex items-center gap-2 text-amber-500 mb-2 font-bold">
                                                <AlertTriangle size={18} />
                                                <span>Approval Required: Unknown Command</span>
                                            </div>
                                            <p className="text-xs text-muted-foreground mb-3">
                                                The AI wants to execute the following command, which is not in the trusted allowlist. 
                                                Executing unknown commands can be dangerous. A Git snapshot will be taken prior to execution.
                                            </p>
                                            <div className="bg-background/80 p-2 rounded border border-border text-xs font-mono mb-4 overflow-x-auto text-amber-400">
                                                {pendingDangerousCommand}
                                            </div>
                                            <div className="flex gap-2">
                                                <button 
                                                    onClick={() => executeAndContinue(pendingDangerousCommand, chatHistory)}
                                                    className="flex-1 bg-amber-500 hover:bg-amber-600 text-white py-1.5 rounded-md text-xs font-bold transition-colors flex justify-center items-center gap-1"
                                                >
                                                    <CheckCircle size={14} /> Allow & Execute
                                                </button>
                                                <button 
                                                    onClick={() => rejectAndContinue(chatHistory)}
                                                    className="flex-1 bg-background border border-border hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 py-1.5 rounded-md text-xs font-medium transition-colors flex justify-center items-center gap-1"
                                                >
                                                    <X size={14} /> Reject
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}
                                {isChatLoading && !pendingDangerousCommand && (
                                    <div className="flex flex-col items-start">
                                        <div className="px-4 py-3 rounded-2xl bg-accent text-accent-foreground rounded-tl-sm flex items-center gap-2">
                                            <Loader2 size={16} className="animate-spin" />
                                            <span className="text-sm">{t('task_working')}</span>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="p-4 border-t border-border bg-background shrink-0">
                                <div className="flex flex-col gap-2">
                                    <textarea
                                        className="w-full p-2 border border-border rounded-md bg-transparent text-sm resize-none custom-scrollbar focus:outline-none focus:ring-1 focus:ring-primary/50"
                                        placeholder={t('task_chat_ph')}
                                        rows={4}
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
                                        {t('task_send_ai')}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <div className="p-4 border-t border-border flex justify-between items-center bg-background">
                    <select
                        className="p-2 border border-border rounded-md bg-transparent text-sm font-medium"
                        value={formData.status}
                        onChange={e => setFormData({ ...formData, status: e.target.value as any })}
                    >
                        <option value="todo">{t('status_todo')}</option>
                        <option value="in-progress">{t('status_progress')}</option>
                        <option value="pending-review">{t('status_review')}</option>
                        <option value="done">{t('status_done')}</option>
                    </select>
                    <div className="flex gap-3">
                        {formData.id && (
                            <button onClick={handleDelete} className="px-3 py-2 border border-destructive/50 text-destructive bg-destructive/10 rounded-md hover:bg-destructive text-sm font-medium hover:text-destructive-foreground flex items-center gap-2">
                                <Trash2 size={16} /> {t('mod_delete')}
                            </button>
                        )}
                        <button onClick={onClose} className="px-4 py-2 border border-border rounded-md hover:bg-accent text-sm font-medium">{t('btn_cancel')}</button>
                        <button onClick={() => handleSave(false)} disabled={!formData.title} className="px-4 py-2 bg-primary text-primary-foreground rounded-md flex items-center gap-2 text-sm font-medium hover:opacity-90 disabled:opacity-50">
                            <Save size={16} /> {t('mod_save')}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
