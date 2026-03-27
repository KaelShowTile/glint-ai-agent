import { useState, useEffect } from 'react';
import { useTheme } from '../hooks/useTheme';
import { useTranslation, Language } from '../lib/i18n';
import { Settings as SettingsIcon, Briefcase, Edit2, Trash2 } from 'lucide-react';
import { Profession, getProfessions, createProfession, updateProfession, deleteProfession } from '../lib/professions';

export default function Settings() {
    const { theme, toggleTheme } = useTheme();
    const { t, lang, setLang } = useTranslation();
    const [activeTab, setActiveTab] = useState<'global' | 'professions'>('global');

    // Professions State
    const [professions, setProfessions] = useState<Profession[]>([]);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [formData, setFormData] = useState<Profession>({ name: '', description: '', system_prompt: '' });

    const loadProfessions = async () => {
        try {
            const data = await getProfessions();
            setProfessions(data);
        } catch (e: any) {
            console.error(e);
        }
    };

    useEffect(() => {
        if (activeTab === 'professions') {
            loadProfessions();
        }
    }, [activeTab]);

    const handleSaveProfession = async () => {
        if (!formData.name) return;
        try {
            if (editingId) {
                await updateProfession(editingId, formData);
            } else {
                await createProfession(formData);
            }
            setEditingId(null);
            setFormData({ name: '', description: '', system_prompt: '' });
            loadProfessions();
        } catch (e: any) {
            alert(e.toString());
        }
    };

    const handleDeleteProfession = async (id: number) => {
        if (confirm(t('prof_delete_confirm') || 'Are you sure?')) {
            await deleteProfession(id);
            loadProfessions();
        }
    };

    const handleEditProfession = (prof: Profession) => {
        setEditingId(prof.id!);
        setFormData(prof);
    };

    return (
        <div className="p-8 max-w-5xl mx-auto h-full flex flex-col">
            <h1 className="text-3xl font-bold mb-6">{t('settings_title')}</h1>

            <div className="flex border-b border-border mb-6">
                <button
                    onClick={() => setActiveTab('global')}
                    className={`px-4 py-2 font-medium text-sm flex items-center gap-2 border-b-2 transition-colors ${activeTab === 'global' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
                >
                    <SettingsIcon size={16} /> {t('tab_global') || 'Global Settings'}
                </button>
                <button
                    onClick={() => setActiveTab('professions')}
                    className={`px-4 py-2 font-medium text-sm flex items-center gap-2 border-b-2 transition-colors ${activeTab === 'professions' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
                >
                    <Briefcase size={16} /> {t('tab_prof') || 'Professions'}
                </button>
            </div>

            {activeTab === 'global' && (
                <div className="bg-card border border-border rounded-lg p-6 space-y-6 flex-1">
                    <div>
                        <h2 className="text-xl font-semibold mb-2">{t('settings_appearance')}</h2>
                        <p className="text-muted-foreground text-sm mb-4">{t('settings_appearance_desc')}</p>
                        <div className="flex items-center justify-between p-4 border border-border rounded-lg bg-background mb-4">
                            <span>{t('settings_theme_mode')}</span>
                            <button
                                onClick={toggleTheme}
                                className="px-4 py-2 rounded-md font-medium capitalize bg-accent text-accent-foreground hover:opacity-90"
                            >
                                {t('settings_toggle')} {theme === 'light' ? 'Dark' : 'Light'}
                            </button>
                        </div>

                        <h2 className="text-xl font-semibold mb-2">{t('settings_lang')}</h2>
                        <p className="text-muted-foreground text-sm mb-4">{t('settings_lang_desc') || 'Choose your preferred language'}</p>
                        <div className="flex items-center justify-between p-4 border border-border rounded-lg bg-background">
                            <span>{t('settings_lang')}</span>
                            <select
                                value={lang}
                                onChange={e => setLang(e.target.value as Language)}
                                className="bg-accent text-accent-foreground px-4 py-2 border border-border rounded-md font-medium"
                            >
                                <option value="en">English</option>
                                <option value="zh">简体中文</option>
                            </select>
                        </div>
                    </div>

                    <div className="pt-6 border-t border-border">
                        <h2 className="text-xl font-semibold mb-2">API Keys Base</h2>
                        <p className="text-muted-foreground text-sm mb-4">
                            Note: You define API Keys per AI Employee in the Employees tab, or per individual task via Custom AI overrides.
                        </p>
                    </div>

                    <div className="pt-6 border-t border-border">
                        <h2 className="text-xl font-semibold mb-2">Data & Storage</h2>
                        <p className="text-muted-foreground text-sm mb-4">
                            All project multi-media assets (images) are stored automatically in your local `Documents/MyAIAgent/Projects/...` directory.
                            The SQLite database `myaiapp.db` lives in your application config folder.
                        </p>
                    </div>
                </div>
            )}

            {activeTab === 'professions' && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 flex-1 min-h-0">
                    <div className="md:col-span-1 bg-card border border-border rounded-lg p-5 flex flex-col gap-4 overflow-y-auto h-fit">
                        <h2 className="font-semibold text-lg">{editingId ? (t('prof_edit') || 'Edit Profession') : (t('prof_add') || 'Add Profession')}</h2>

                        <input className="w-full p-2 border border-border rounded-md bg-transparent" placeholder={t('prof_name') || 'Name'} value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} />
                        <input className="w-full p-2 border border-border rounded-md bg-transparent" placeholder={t('prof_desc') || 'Description'} value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} />
                        <textarea className="w-full p-2 border border-border rounded-md bg-transparent min-h-[250px] text-sm custom-scrollbar" placeholder={t('prof_prompt') || 'System Prompt'} value={formData.system_prompt} onChange={e => setFormData({ ...formData, system_prompt: e.target.value })} />

                        <button onClick={handleSaveProfession} className="mt-2 w-full bg-primary text-primary-foreground p-2 rounded-md font-medium hover:opacity-90 transition-opacity">
                            {t('prof_save') || 'Save'}
                        </button>

                        {editingId && (
                            <button onClick={() => { setEditingId(null); setFormData({ name: '', description: '', system_prompt: '' }); }} className="w-full border border-border bg-transparent text-foreground p-2 rounded-md hover:bg-accent transition-colors">
                                {t('btn_cancel') || 'Cancel'}
                            </button>
                        )}
                    </div>

                    <div className="md:col-span-2 overflow-y-auto pr-2 space-y-4">
                        <h2 className="font-semibold text-xl mb-4">{t('prof_title') || 'Professions'}</h2>
                        {professions.map(prof => (
                            <div key={prof.id} className="bg-card border border-border p-4 rounded-lg flex flex-col gap-3 hover:shadow-sm transition-shadow">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <h3 className="font-bold text-lg text-primary">{prof.name}</h3>
                                        <div className="text-sm text-muted-foreground mt-1">{prof.description}</div>
                                    </div>
                                    <div className="flex gap-2">
                                        <button onClick={() => handleEditProfession(prof)} className="text-muted-foreground hover:text-primary transition-colors"><Edit2 size={16} /></button>
                                        <button onClick={() => handleDeleteProfession(prof.id!)} className="text-destructive hover:opacity-80 transition-opacity"><Trash2 size={16} /></button>
                                    </div>
                                </div>
                                <div className="p-3 bg-background rounded-md border border-border">
                                    <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-mono line-clamp-3 overflow-hidden">{prof.system_prompt}</pre>
                                </div>
                            </div>
                        ))}
                        {professions.length === 0 && (
                            <div className="h-40 flex flex-col items-center justify-center border-2 border-dashed border-border rounded-lg text-muted-foreground">
                                <Briefcase size={32} className="mb-2 opacity-50" />
                                <p>{t('prof_empty') || 'No professions found.'}</p>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}
