import { useState, useEffect } from 'react';
import { ProjectInfo, getProjectInfos, saveProjectInfo, deleteProjectInfo } from '../lib/project_info';
import { Profession, getProfessions } from '../lib/professions';
import { useTranslation } from '../lib/i18n';
import { Plus, Edit2, Trash2, X, Save } from 'lucide-react';

export default function ProjectInfoBoard({ projectId }: { projectId: number }) {
    const { t } = useTranslation();
    const [infos, setInfos] = useState<ProjectInfo[]>([]);
    const [professions, setProfessions] = useState<Profession[]>([]);
    
    // Modal state
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [formData, setFormData] = useState<ProjectInfo>({ project_id: projectId, name: '', content: '', target_profession_id: null });

    const loadData = async () => {
        const [loadedInfos, loadedProfs] = await Promise.all([
            getProjectInfos(projectId),
            getProfessions()
        ]);
        setInfos(loadedInfos);
        setProfessions(loadedProfs);
    };

    useEffect(() => {
        loadData();
    }, [projectId]);

    const handleSave = async () => {
        if (!formData.name.trim() || !formData.content.trim()) return;
        await saveProjectInfo(formData);
        setIsModalOpen(false);
        loadData();
    };

    const handleDelete = async (id: number) => {
        if (confirm(t('info_delete_confirm'))) {
            await deleteProjectInfo(id);
            loadData();
        }
    };

    const openModal = (info?: ProjectInfo) => {
        if (info) {
            setFormData(info);
        } else {
            setFormData({ project_id: projectId, name: '', content: '', target_profession_id: null });
        }
        setIsModalOpen(true);
    };

    const getTargetProfessionName = (id: number | null) => {
        if (!id) return t('info_all');
        const prof = professions.find(p => p.id === id);
        return prof ? prof.name : t('info_all');
    };

    return (
        <div className="flex-1 overflow-y-auto p-6 relative">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold">{t('info_title')}</h2>
                <button 
                    onClick={() => openModal()}
                    className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:opacity-90 transition-opacity text-sm font-medium"
                >
                    <Plus size={16} /> {t('info_add')}
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {infos.map(info => (
                    <div key={info.id} className="bg-card border border-border p-4 rounded-lg shadow-sm flex flex-col group hover:border-primary/50 transition-colors">
                        <div className="flex justify-between items-start mb-2">
                            <h3 className="font-semibold text-lg">{info.name}</h3>
                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={() => openModal(info)} className="p-1 text-muted-foreground hover:text-primary"><Edit2 size={16} /></button>
                                <button onClick={() => handleDelete(info.id!)} className="p-1 text-muted-foreground hover:text-destructive"><Trash2 size={16} /></button>
                            </div>
                        </div>
                        <div className="mb-3 text-xs font-medium text-primary bg-primary/10 w-fit px-2 py-1 rounded-sm">
                            {t('info_target')}: {getTargetProfessionName(info.target_profession_id)}
                        </div>
                        <div className="text-sm text-foreground/80 line-clamp-5 whitespace-pre-wrap flex-1 custom-scrollbar overflow-y-auto max-h-[150px]">
                            {info.content}
                        </div>
                    </div>
                ))}
            </div>

            {isModalOpen && (
                <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 shrink-0">
                    <div className="bg-card w-full max-w-2xl flex flex-col rounded-lg border border-border shadow-2xl relative">
                        <div className="p-4 border-b border-border flex justify-between items-center bg-accent/30">
                            <h2 className="text-xl font-bold">{formData.id ? t('info_add') : t('info_add')}</h2>
                            <button onClick={() => setIsModalOpen(false)} className="p-1 hover:bg-accent rounded-md"><X size={20} /></button>
                        </div>
                        
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="text-sm font-semibold mb-1 block">{t('info_name')}</label>
                                <input 
                                    className="w-full p-2 border border-border rounded-md bg-transparent text-sm focus:border-primary outline-none"
                                    value={formData.name}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                />
                            </div>
                            
                            <div>
                                <label className="text-sm font-semibold mb-1 block">{t('info_target')}</label>
                                <select 
                                    className="w-full p-2 border border-border rounded-md bg-transparent text-sm focus:border-primary outline-none"
                                    value={formData.target_profession_id || ''}
                                    onChange={e => setFormData({ ...formData, target_profession_id: e.target.value ? Number(e.target.value) : null })}
                                >
                                    <option value="">{t('info_all')}</option>
                                    {professions.map(p => (
                                        <option key={p.id} value={p.id}>{p.name}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="text-sm font-semibold mb-1 block">{t('info_content')}</label>
                                <textarea 
                                    className="w-full p-3 border border-border rounded-md bg-transparent min-h-[200px] text-sm custom-scrollbar focus:border-primary outline-none resize-y"
                                    value={formData.content}
                                    onChange={e => setFormData({ ...formData, content: e.target.value })}
                                />
                            </div>
                        </div>

                        <div className="p-4 border-t border-border flex justify-end gap-3 bg-background">
                            <button onClick={() => setIsModalOpen(false)} className="px-4 py-2 border border-border rounded-md hover:bg-accent text-sm font-medium">{t('btn_cancel')}</button>
                            <button onClick={handleSave} disabled={!formData.name || !formData.content} className="px-4 py-2 bg-primary text-primary-foreground rounded-md flex items-center gap-2 text-sm font-medium hover:opacity-90 disabled:opacity-50">
                                <Save size={16} /> {t('mod_save')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
