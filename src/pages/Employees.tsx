import { useState, useEffect } from 'react';
import { Edit2, Trash2, Users, Loader2, FileCode } from 'lucide-react';
import { AIEmployee, getEmployees, createEmployee, updateEmployee, deleteEmployee } from '../lib/employees';
import { getGoogleModels } from '../lib/llm';
import { Profession, getProfessions } from '../lib/professions';
import { open } from '@tauri-apps/plugin-dialog';
import { useTranslation } from '../lib/i18n';

export default function Employees() {
    const { t } = useTranslation();
    const [employees, setEmployees] = useState<AIEmployee[]>([]);
    const [professions, setProfessions] = useState<Profession[]>([]);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [availableModels, setAvailableModels] = useState<string[]>([]);
    const [isFetchingModels, setIsFetchingModels] = useState(false);
    const [formData, setFormData] = useState<AIEmployee>({
        name: '', role: '', api_url: '', api_key: '', model: '', system_prompt: '', skill_path: ''
    });

    const loadEmployees = async () => {
        try {
            const data = await getEmployees();
            setEmployees(data);
            const profs = await getProfessions();
            setProfessions(profs);
        } catch (e: any) {
            console.error(e);
            alert("Error loading employees: " + e.toString());
        }
    };

    useEffect(() => {
        loadEmployees();
    }, []);

    const handleSave = async () => {
        if (!formData.name || !formData.role) return;
        try {
            if (editingId) {
                await updateEmployee(editingId, formData);
            } else {
                await createEmployee(formData);
            }
            setEditingId(null);
            setFormData({ name: '', role: '', api_url: '', api_key: '', model: '', system_prompt: '', skill_path: '' });
            setAvailableModels([]);
            loadEmployees();
        } catch (e: any) {
            console.error(e);
            alert("Error saving employee: " + e.toString());
        }
    };

    const handleDelete = async (id: number) => {
        if (confirm('Are you sure you want to delete this AI Employee?')) {
            await deleteEmployee(id);
            loadEmployees();
        }
    };

    const handleEdit = (emp: AIEmployee) => {
        setEditingId(emp.id!);
        setFormData(emp);
        setAvailableModels([]);
    };

    const handleFetchModels = async () => {
        if (!formData.api_key) return alert("Please enter your API Key first.");
        setIsFetchingModels(true);
        try {
            const models = await getGoogleModels(formData.api_key);
            setAvailableModels(models);
            if (models.length > 0 && !models.includes(formData.model)) {
                setFormData(prev => ({ ...prev, model: models[0] }));
            }
        } catch (e: any) {
            alert(e.message);
        } finally {
            setIsFetchingModels(false);
        }
    };

    return (
        <div className="p-8 max-w-5xl mx-auto flex flex-col h-full gap-6">
            <div className="flex justify-between items-end">
                <div>
                    <h1 className="text-3xl font-bold">{t('emp_title')}</h1>
                    <p className="text-muted-foreground mt-2">Create and manage your AI agent base personas.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 flex-1 min-h-0">
                <div className="md:col-span-1 bg-card border border-border rounded-lg p-5 flex flex-col gap-4 overflow-y-auto">
                    <h2 className="font-semibold text-lg">{editingId ? 'Edit AI Employee' : t('emp_add')}</h2>

                    <input className="w-full p-2 border border-border rounded-md bg-transparent" placeholder={t('emp_name')} value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} />
                    
                    <select className="w-full p-2 border border-border rounded-md bg-transparent text-sm" value={formData.role} onChange={e => {
                        const prof = professions.find(p => p.name === e.target.value);
                        setFormData({ 
                            ...formData, 
                            role: e.target.value,
                            system_prompt: prof ? prof.system_prompt : formData.system_prompt 
                        });
                    }}>
                        <option value="" disabled>-- Select Profession --</option>
                        {professions.map(p => (
                            <option key={p.id} value={p.name}>{p.name}</option>
                        ))}
                    </select>

                    <select className="w-full p-2 border border-border rounded-md bg-transparent text-sm" value={formData.api_url} onChange={e => setFormData({ ...formData, api_url: e.target.value })}>
                        <option value="" disabled>-- {t('emp_provider')} --</option>
                        <option value="OpenAI/LM Studio">OpenAI/LM Studio</option>
                        <option value="Google">Google (Gemini API)</option>
                        <option value="Groq">Groq</option>
                        <option value="ComfyUI">ComfyUI (Image Generation)</option>
                    </select>
                    <input className="w-full p-2 border border-border rounded-md bg-transparent text-sm" placeholder="API Key" type="password" value={formData.api_key} onChange={e => setFormData({ ...formData, api_key: e.target.value })} />

                    <div className="flex gap-2">
                        {formData.api_url === 'Google' && availableModels.length > 0 ? (
                            <select className="flex-1 p-2 border border-border rounded-md bg-transparent text-sm" value={formData.model} onChange={e => setFormData({ ...formData, model: e.target.value })}>
                                {availableModels.map(m => <option key={m} value={m}>{m}</option>)}
                            </select>
                        ) : (
                            <input className="flex-1 p-2 border border-border rounded-md bg-transparent text-sm" placeholder={t('emp_model')} value={formData.model} onChange={e => setFormData({ ...formData, model: e.target.value })} />
                        )}

                        {formData.api_url === 'Google' && (
                            <button onClick={handleFetchModels} disabled={isFetchingModels || !formData.api_key} className="px-3 bg-accent text-accent-foreground border border-border rounded-md hover:opacity-80 disabled:opacity-50 text-xs flex items-center gap-1 transition-opacity">
                                {isFetchingModels ? <Loader2 size={14} className="animate-spin" /> : "Load Models"}
                            </button>
                        )}
                    </div>

                    <div className="flex gap-2">
                        <input className="flex-1 p-2 border border-border rounded-md bg-accent/20 text-sm cursor-not-allowed" placeholder={t('emp_skill')} value={formData.skill_path || ''} readOnly />
                        <button 
                            onClick={async () => {
                                const selected = await open({
                                    multiple: false,
                                    directory: false,
                                    title: "Select Skill File for AI Employee"
                                });
                                if (selected && typeof selected === 'string') {
                                    setFormData({ ...formData, skill_path: selected });
                                }
                            }} 
                            className="bg-accent text-accent-foreground px-3 py-2 rounded-md hover:opacity-80 transition-opacity flex items-center justify-center border border-border"
                            title="Browse Skill File"
                        >
                            <FileCode size={16} />
                        </button>
                        {formData.skill_path && (
                            <button onClick={() => setFormData({...formData, skill_path: ''})} className="bg-destructive/10 text-destructive border border-destructive/20 hover:bg-destructive hover:text-white px-3 rounded-md transition-colors flex items-center justify-center">
                                <Trash2 size={16} />
                            </button>
                        )}
                    </div>

                    <textarea className="w-full p-2 border border-border rounded-md bg-transparent min-h-[120px] text-sm" placeholder={t('emp_prompt')} value={formData.system_prompt} onChange={e => setFormData({ ...formData, system_prompt: e.target.value })} />

                    <button onClick={handleSave} className="mt-2 w-full bg-primary text-primary-foreground p-2 rounded-md font-medium hover:opacity-90 transition-opacity">
                        {editingId ? 'Update Employee' : t('emp_save')}
                    </button>

                    {editingId && (
                        <button onClick={() => { setEditingId(null); setFormData({ name: '', role: '', api_url: '', api_key: '', model: '', system_prompt: '', skill_path: '' }); setAvailableModels([]); }} className="w-full border border-border bg-transparent text-foreground p-2 rounded-md hover:bg-accent transition-colors">
                            Cancel
                        </button>
                    )}
                </div>

                <div className="md:col-span-2 overflow-y-auto pr-2 space-y-4">
                    {employees.map(emp => (
                        <div key={emp.id} className="bg-card border border-border p-4 rounded-lg flex items-start gap-4 hover:shadow-sm transition-shadow">
                            <div className="w-12 h-12 rounded-full bg-accent flex items-center justify-center font-bold text-xl text-primary">
                                {emp.name.charAt(0)}
                            </div>
                            <div className="flex-1">
                                <div className="flex justify-between items-start">
                                    <h3 className="font-bold text-lg">{emp.name}</h3>
                                    <div className="flex gap-2">
                                        <button onClick={() => handleEdit(emp)} className="text-muted-foreground hover:text-primary transition-colors"><Edit2 size={16} /></button>
                                        <button onClick={() => handleDelete(emp.id!)} className="text-destructive hover:opacity-80 transition-opacity"><Trash2 size={16} /></button>
                                    </div>
                                </div>
                                <div className="text-sm font-medium text-muted-foreground mt-1">{emp.role}</div>
                                <div className="mt-3 flex gap-2 flex-wrap text-xs">
                                    <span className="px-2 py-1 bg-accent rounded-full border border-border font-mono">{emp.model || 'No model'}</span>
                                    <span className="px-2 py-1 bg-accent rounded-full border border-border truncate max-w-[200px]" title={emp.api_url}>{emp.api_url || 'No API Provider'}</span>
                                    {emp.skill_path && <span className="px-2 py-1 bg-primary/10 text-primary rounded-full border border-primary/20 flex items-center gap-1"><FileCode size={12}/> Skill Loaded</span>}
                                </div>
                            </div>
                        </div>
                    ))}
                    {employees.length === 0 && (
                        <div className="h-40 flex flex-col items-center justify-center border-2 border-dashed border-border rounded-lg text-muted-foreground">
                            <Users size={32} className="mb-2 opacity-50" />
                            <p>No AI employees found. Create one to get started.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
