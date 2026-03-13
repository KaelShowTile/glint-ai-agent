import { useState, useEffect } from 'react';
import { Project, getProjects, createProject, deleteProject } from '../lib/projects';
import { AIEmployee, getEmployees } from '../lib/employees';
import { Trash2, FolderPlus, FileJson } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { open } from '@tauri-apps/plugin-dialog';

export default function Projects() {
    const [projects, setProjects] = useState<Project[]>([]);
    const [employees, setEmployees] = useState<AIEmployee[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [newProject, setNewProject] = useState({ name: '', description: '', save_path: '', manager_ai_id: 0 });
    const navigate = useNavigate();

    const loadProjects = async () => {
        try {
            const data = await getProjects();
            setProjects(data);
            const emps = await getEmployees();
            setEmployees(emps);
        } catch (e: any) {
            console.error(e);
            alert("Error loading projects or employees: " + e.toString());
        }
    };

    useEffect(() => { loadProjects() }, []);

    const handleCreate = async () => {
        if (!newProject.name) return;
        try {
            const projToSave: Project = { ...newProject, manager_ai_id: newProject.manager_ai_id || null };
            const id = await createProject(projToSave);
            setIsModalOpen(false);
            setNewProject({ name: '', description: '', save_path: '', manager_ai_id: 0 });
            navigate(`/project/${id}`);
        } catch (e: any) {
            console.error(e);
            alert("Error creating project: " + e.toString());
        }
    };

    const handleDelete = async (e: React.MouseEvent, id: number) => {
        e.stopPropagation();
        if (confirm('Are you sure you want to delete this project? Overriding assets might be kept locally but the database link will be deleted.')) {
            await deleteProject(id);
            loadProjects();
        }
    };

    return (
        <div className="p-8 max-w-6xl mx-auto flex flex-col h-full relative">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-bold">Projects</h1>
                    <p className="text-muted-foreground mt-2">Manage your AI workflows and view project status.</p>
                </div>
                <button onClick={() => setIsModalOpen(true)} className="bg-primary text-primary-foreground px-4 py-2 rounded-md font-medium flex items-center gap-2 hover:opacity-90 transition-opacity">
                    <FolderPlus size={18} /> New Project
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {projects.map(proj => (
                    <div key={proj.id} onClick={() => navigate(`/project/${proj.id}`)} className="bg-card border border-border rounded-lg p-5 cursor-pointer hover:shadow-md transition-all group flex flex-col h-48">
                        <div className="flex justify-between items-start mb-2">
                            <h3 className="font-bold text-xl line-clamp-1 flex-1">{proj.name}</h3>
                            <button onClick={(e) => handleDelete(e, proj.id!)} className="text-muted-foreground hover:text-destructive transition-colors opacity-0 group-hover:opacity-100">
                                <Trash2 size={18} />
                            </button>
                        </div>
                        <p className="text-muted-foreground text-sm line-clamp-3 mb-auto">{proj.description}</p>
                        <div className="mt-4 pt-4 border-t border-border flex justify-between items-center text-xs text-muted-foreground">
                            <span className={`px-2 py-1 rounded-full ${proj.status === 'active' ? 'bg-green-500/10 text-green-600 dark:text-green-400' : 'bg-accent'}`}>{proj.status}</span>
                            <span>{proj.created_at?.split(' ')[0]}</span>
                        </div>
                    </div>
                ))}
            </div>

            {projects.length === 0 && (
                <div className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-border rounded-lg text-muted-foreground opacity-70">
                    <FileJson size={48} className="mb-4" />
                    <p className="text-lg">No projects yet. Create one to begin your AI workflows!</p>
                </div>
            )}

            {/* Basic Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50">
                    <div className="bg-card w-full max-w-md p-6 rounded-lg border border-border shadow-lg">
                        <h2 className="text-2xl font-bold mb-4">Create New Project</h2>
                        <div className="space-y-4">
                            <div>
                                <label className="text-sm font-medium mb-1 block">Project Name</label>
                                <input autoFocus className="w-full p-2 border border-border rounded-md bg-transparent" value={newProject.name} onChange={e => setNewProject({ ...newProject, name: e.target.value })} placeholder="e.g. Graphic Novel Generator" />
                            </div>
                            <div>
                                <label className="text-sm font-medium mb-1 block">Description</label>
                                <textarea className="w-full p-2 border border-border rounded-md bg-transparent" rows={3} value={newProject.description} onChange={e => setNewProject({ ...newProject, description: e.target.value })} placeholder="Brief overview of what this workflow will accomplish..." />
                            </div>
                            <div>
                                <label className="text-sm font-medium mb-1 block">Project Folder Path</label>
                                <div className="flex gap-2">
                                    <input className="flex-1 p-2 border border-border rounded-md bg-accent/30 text-sm" readOnly value={newProject.save_path} placeholder="Where to save local assets..." />
                                    <button onClick={async () => {
                                        const selected = await open({ directory: true, multiple: false });
                                        if (selected) setNewProject({ ...newProject, save_path: selected as string });
                                    }} className="px-3 bg-accent text-accent-foreground border border-border rounded-md hover:bg-accent/80 transition-colors">Browse...</button>
                                </div>
                            </div>
                            <div>
                                <label className="text-sm font-medium mb-1 block">AI Project Manager (Auto-assignee)</label>
                                <select
                                    className="w-full p-2 border border-border rounded-md bg-transparent text-sm"
                                    value={newProject.manager_ai_id}
                                    onChange={e => setNewProject({ ...newProject, manager_ai_id: Number(e.target.value) })}
                                >
                                    <option value={0}>-- None --</option>
                                    {employees.map(e => <option key={e.id} value={e.id}>{e.name} ({e.role})</option>)}
                                </select>
                            </div>
                        </div>
                        <div className="mt-6 flex justify-end gap-3">
                            <button onClick={() => setIsModalOpen(false)} className="px-4 py-2 border border-border rounded-md hover:bg-accent transition-colors">Cancel</button>
                            <button onClick={handleCreate} disabled={!newProject.name || !newProject.save_path} className="px-4 py-2 bg-primary text-primary-foreground rounded-md disabled:opacity-50">Create Project</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
