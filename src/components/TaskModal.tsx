import { useState, useEffect } from 'react';
import { WorkflowTask, saveTask, deleteTask } from '../lib/tasks';
import { AIEmployee, getEmployees } from '../lib/employees';
import { callLLM } from '../lib/llm';
import { X, Save, Paperclip, Bot, User, Plus, Trash2, Loader2 } from 'lucide-react';

interface TaskModalProps {
    task: WorkflowTask;
    allTasks: WorkflowTask[];
    onClose: () => void;
    onSaved: () => void;
}

export default function TaskModal({ task, allTasks, onClose, onSaved }: TaskModalProps) {
    const [formData, setFormData] = useState<WorkflowTask>(task);
    const [employees, setEmployees] = useState<AIEmployee[]>([]);
    const [customApiConfig, setCustomApiConfig] = useState({ apiUrl: '', apiKey: '', model: '', systemPrompt: '' });
    const [assets, setAssets] = useState<string[]>([]); // simplified asset repeater
    const [parentIds, setParentIds] = useState<number[]>([]);
    const [isExecuting, setIsExecuting] = useState(false);

    useEffect(() => {
        getEmployees().then(setEmployees);
        if (task.custom_api_config) {
            try { setCustomApiConfig(JSON.parse(task.custom_api_config)); } catch (e) { }
        }
        if (task.parent_task_ids) {
            try { setParentIds(JSON.parse(task.parent_task_ids)); } catch (e) { }
        }
        // Load local assets in a real app via another DB call. Mocked here.
    }, [task]);

    const handleSave = async () => {
        if (formData.assignee_type === 'customAI') {
            formData.custom_api_config = JSON.stringify(customApiConfig);
        } else {
            formData.custom_api_config = null;
        }
        formData.parent_task_ids = JSON.stringify(parentIds);
        await saveTask(formData);
        onSaved();
        onClose();
    };

    const handleDelete = async () => {
        if (!formData.id) return;
        if (confirm('Are you sure you want to delete this task?')) {
            await deleteTask(formData.id);
            onSaved();
            onClose();
        }
    };

    const handleExecuteAI = async () => {
        setIsExecuting(true);
        try {
            let apiUrl = '';
            let apiKey = '';
            let model = '';
            let sysPrompt = '';

            if (formData.assignee_type === 'predefinedAI') {
                const emp = employees.find(e => e.id === formData.ai_id);
                if (!emp) throw new Error("Please select a predefined AI Employee first.");
                apiUrl = emp.api_url;
                apiKey = emp.api_key;
                model = emp.model;
                sysPrompt = emp.system_prompt;
            } else if (formData.assignee_type === 'customAI') {
                apiUrl = customApiConfig.apiUrl;
                apiKey = customApiConfig.apiKey;
                model = customApiConfig.model;
                sysPrompt = customApiConfig.systemPrompt;
                if (!apiUrl) throw new Error("Please provide a custom API Provider/URL.");
            } else {
                throw new Error("Cannot execute AI for a Human assigned task.");
            }

            const prompt = `Task Title: ${formData.title}\n\nTask Description & Constraints:\n${formData.description}\n\nPlease execute this task and provide the final deliverable.`;

            const messages: any[] = [];
            if (sysPrompt) messages.push({ role: 'system', content: sysPrompt });
            messages.push({ role: 'user', content: prompt });

            const response = await callLLM(apiUrl, apiKey, model, messages);

            setFormData(prev => ({
                ...prev,
                deliverables: prev.deliverables ? prev.deliverables + "\n\n---\n" + response : response,
                status: 'pending-review'
            }));

        } catch (e: any) {
            console.error(e);
            alert("Error running AI: " + e.message);
        } finally {
            setIsExecuting(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-card w-full max-w-2xl max-h-[90vh] flex flex-col rounded-lg border border-border shadow-2xl relative">
                <div className="p-4 border-b border-border flex justify-between items-center bg-accent/30">
                    <h2 className="text-xl font-bold flex-1 mr-4">
                        <input
                            className="w-full bg-transparent border-b border-transparent hover:border-border focus:border-border outline-none"
                            value={formData.title}
                            onChange={e => setFormData({ ...formData, title: e.target.value })}
                            placeholder="Task Title (e.g. Generate Thumbnail)"
                        />
                    </h2>
                    <button onClick={onClose} className="p-1 hover:bg-accent rounded-md"><X size={20} /></button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    <div>
                        <label className="text-sm font-semibold mb-1 block">Description / Constraints</label>
                        <textarea
                            className="w-full p-3 border border-border rounded-md bg-transparent min-h-[100px] text-sm"
                            value={formData.description}
                            onChange={e => setFormData({ ...formData, description: e.target.value })}
                            placeholder="What exactly needs to be done in this step?"
                        />
                    </div>

                    <div className="p-4 bg-background border border-border rounded-md space-y-3">
                        <h3 className="font-semibold text-sm border-b border-border pb-2">Parent Dependencies</h3>
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
                                <span className="text-muted-foreground text-xs">No other tasks available.</span>
                            )}
                        </div>
                    </div>

                    <div className="p-4 bg-background border border-border rounded-md space-y-4">
                        <h3 className="font-semibold text-sm border-b border-border pb-2">Assignment Configuration</h3>

                        <div className="flex gap-4">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input type="radio" checked={formData.assignee_type === 'human'} onChange={() => setFormData({ ...formData, assignee_type: 'human' })} />
                                <User size={16} /> Human
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input type="radio" checked={formData.assignee_type === 'predefinedAI'} onChange={() => setFormData({ ...formData, assignee_type: 'predefinedAI' })} />
                                <Bot size={16} /> Predefined AI
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input type="radio" checked={formData.assignee_type === 'customAI'} onChange={() => setFormData({ ...formData, assignee_type: 'customAI' })} />
                                <Bot size={16} className="text-primary" /> Custom AI
                            </label>
                        </div>

                        {formData.assignee_type === 'predefinedAI' && (
                            <select
                                className="w-full p-2 border border-border rounded-md bg-transparent text-sm"
                                value={formData.ai_id || ''}
                                onChange={e => setFormData({ ...formData, ai_id: Number(e.target.value) })}
                            >
                                <option value="">-- Select AI Employee --</option>
                                {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name} ({emp.role})</option>)}
                            </select>
                        )}

                        {formData.assignee_type === 'customAI' && (
                            <div className="space-y-3 bg-accent/20 p-3 rounded-md border border-border mt-2">
                                <div className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-2">Custom Sandbox</div>
                                <input className="w-full p-2 border border-border rounded-md bg-transparent text-sm" placeholder="API URL (e.g. OpenAI/ComfyUI)" value={customApiConfig.apiUrl} onChange={e => setCustomApiConfig({ ...customApiConfig, apiUrl: e.target.value })} />
                                <input className="w-full p-2 border border-border rounded-md bg-transparent text-sm" placeholder="API Key" type="password" value={customApiConfig.apiKey} onChange={e => setCustomApiConfig({ ...customApiConfig, apiKey: e.target.value })} />
                                <input className="w-full p-2 border border-border rounded-md bg-transparent text-sm" placeholder="Model" value={customApiConfig.model} onChange={e => setCustomApiConfig({ ...customApiConfig, model: e.target.value })} />
                                <textarea className="w-full p-2 border border-border rounded-md bg-transparent text-sm min-h-[60px]" placeholder="Specific Prompt Instructions..." value={customApiConfig.systemPrompt} onChange={e => setCustomApiConfig({ ...customApiConfig, systemPrompt: e.target.value })} />
                            </div>
                        )}
                    </div>

                    <div className="space-y-2">
                        <h3 className="font-semibold text-sm flex justify-between items-center">
                            <span>Local Assets & Context</span>
                            <button
                                onClick={() => setAssets([...assets, ''])}
                                className="text-xs flex items-center gap-1 text-primary hover:underline hover:opacity-80"
                            >
                                <Plus size={12} /> Add Path
                            </button>
                        </h3>
                        {assets.map((path, idx) => (
                            <div key={idx} className="flex gap-2">
                                <Paperclip size={18} className="text-muted-foreground mt-2 shrink-0" />
                                <input
                                    className="flex-1 p-2 border border-border rounded-md bg-transparent text-sm"
                                    placeholder="C:\Users\Documents\image.png"
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
                        {assets.length === 0 && <p className="text-xs text-muted-foreground">No assets attached. Click add path to link a local file.</p>}
                    </div>

                    <div>
                        <div className="flex justify-between items-end mb-1">
                            <label className="text-sm font-semibold block">Final Deliverables (The outcome of this task)</label>
                            {formData.assignee_type !== 'human' && (
                                <button
                                    onClick={handleExecuteAI}
                                    disabled={isExecuting || !formData.title}
                                    className="bg-primary/20 text-primary hover:bg-primary/30 px-3 py-1 rounded text-xs font-semibold flex items-center gap-1 transition-colors disabled:opacity-50"
                                >
                                    {isExecuting ? <><Loader2 size={14} className="animate-spin" /> Executing...</> : <><Bot size={14} /> Run AI Task</>}
                                </button>
                            )}
                        </div>
                        <textarea
                            className="w-full p-3 border border-primary/20 rounded-md bg-accent/10 min-h-[150px] text-sm"
                            value={formData.deliverables || ''}
                            onChange={e => setFormData({ ...formData, deliverables: e.target.value })}
                            placeholder="The AI will write its output here, or you can manually paste the final approved text/markdown."
                        />
                    </div>
                </div>

                <div className="p-4 border-t border-border flex justify-between items-center bg-background">
                    <select
                        className="p-2 border border-border rounded-md bg-transparent text-sm font-medium"
                        value={formData.status}
                        onChange={e => setFormData({ ...formData, status: e.target.value as any })}
                    >
                        <option value="todo">To Do</option>
                        <option value="in-progress">In Progress</option>
                        <option value="pending-review">Pending Review (Waiting for Human)</option>
                        <option value="done">Done</option>
                    </select>
                    <div className="flex gap-3">
                        {formData.id && (
                            <button onClick={handleDelete} className="px-3 py-2 border border-destructive/50 text-destructive bg-destructive/10 rounded-md hover:bg-destructive text-sm font-medium hover:text-destructive-foreground flex items-center gap-2">
                                <Trash2 size={16} /> Delete
                            </button>
                        )}
                        <button onClick={onClose} className="px-4 py-2 border border-border rounded-md hover:bg-accent text-sm font-medium">Cancel</button>
                        <button onClick={handleSave} disabled={!formData.title} className="px-4 py-2 bg-primary text-primary-foreground rounded-md flex items-center gap-2 text-sm font-medium hover:opacity-90 disabled:opacity-50">
                            <Save size={16} /> Save Task
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
