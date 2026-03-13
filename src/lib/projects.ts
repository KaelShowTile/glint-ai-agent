import { getDb } from './db';

export interface Project {
    id?: number;
    name: string;
    description: string;
    save_path?: string;
    manager_ai_id?: number | null;
    chat_history?: string;
    stage?: string;
    created_at?: string;
    status?: string;
}

export async function getProjects(): Promise<Project[]> {
    const db = await getDb();
    return await db.select<Project[]>('SELECT * FROM projects ORDER BY created_at DESC');
}

export async function getProjectById(id: number): Promise<Project | null> {
    const db = await getDb();
    const res = await db.select<Project[]>('SELECT * FROM projects WHERE id=$1', [id]);
    return res.length > 0 ? res[0] : null;
}

export async function createProject(proj: Project): Promise<number> {
    const db = await getDb();
    const res = await db.execute(
        'INSERT INTO projects (name, description, status, save_path, manager_ai_id) VALUES ($1, $2, $3, $4, $5)',
        [proj.name, proj.description, proj.status || 'active', proj.save_path || '', proj.manager_ai_id ?? null]
    );
    return res.lastInsertId as number;
}

export async function deleteProject(id: number): Promise<void> {
    const db = await getDb();
    await db.execute('DELETE FROM projects WHERE id=$1', [id]);
}

export async function updateProjectChatHistory(id: number, chatHistory: string): Promise<void> {
    const db = await getDb();
    await db.execute('UPDATE projects SET chat_history=$1 WHERE id=$2', [chatHistory, id]);
}

export async function updateProjectStage(id: number, stage: string): Promise<void> {
    const db = await getDb();
    await db.execute('UPDATE projects SET stage=$1 WHERE id=$2', [stage, id]);
}

export interface ComfyTemplate {
    id?: number;
    project_id: number;
    template_name: string;
    workflow_json: string;
}

export async function getProjectTemplates(projectId: number): Promise<ComfyTemplate[]> {
    const db = await getDb();
    return await db.select<ComfyTemplate[]>('SELECT * FROM project_comfyui_templates WHERE project_id=$1', [projectId]);
}

export async function saveProjectTemplate(tpl: ComfyTemplate): Promise<void> {
    const db = await getDb();
    if (tpl.id) {
        await db.execute('UPDATE project_comfyui_templates SET template_name=$1, workflow_json=$2 WHERE id=$3', [tpl.template_name, tpl.workflow_json, tpl.id]);
    } else {
        await db.execute('INSERT INTO project_comfyui_templates (project_id, template_name, workflow_json) VALUES ($1, $2, $3)', [tpl.project_id, tpl.template_name, tpl.workflow_json]);
    }
}

export async function deleteProjectTemplate(id: number): Promise<void> {
    const db = await getDb();
    await db.execute('DELETE FROM project_comfyui_templates WHERE id=$1', [id]);
}
