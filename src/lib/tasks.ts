import { getDb } from './db';

export interface WorkflowTask {
    id?: number;
    project_id: number;
    title: string;
    description: string;
    status: 'todo' | 'in-progress' | 'pending-review' | 'done';
    assignee_type: 'human' | 'predefinedAI' | 'customAI';
    ai_id?: number | null;
    custom_api_config?: string | null;  // JSON string: { apiUrl, apiKey, model, systemPrompt }
    deliverables?: string | null;       // The final output of the task
    parent_task_ids?: string | null;    // JSON string: array of integer IDs e.g. "[1, 2]"
    chat_history?: string | null;       // JSON string: array of LLM messages
}

export async function getTasks(projectId: number): Promise<WorkflowTask[]> {
    const db = await getDb();
    return await db.select<WorkflowTask[]>('SELECT * FROM tasks WHERE project_id=$1 ORDER BY id ASC', [projectId]);
}

export async function saveTask(task: WorkflowTask): Promise<number | null> {
    const db = await getDb();
    if (task.id) {
        await db.execute(
            `UPDATE tasks SET 
        title=$1, description=$2, status=$3, assignee_type=$4, 
        ai_id=$5, custom_api_config=$6, deliverables=$7, parent_task_ids=$8, chat_history=$9 
       WHERE id=$10`,
            [task.title, task.description, task.status, task.assignee_type, task.ai_id, task.custom_api_config, task.deliverables, task.parent_task_ids, task.chat_history || null, task.id]
        );
        return task.id;
    } else {
        const res = await db.execute(
            `INSERT INTO tasks (project_id, title, description, status, assignee_type, ai_id, custom_api_config, deliverables, parent_task_ids, chat_history) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [task.project_id, task.title, task.description, task.status || 'todo', task.assignee_type || 'human', task.ai_id ?? null, task.custom_api_config, task.deliverables, task.parent_task_ids || '[]', task.chat_history || null]
        );
        return res.lastInsertId ?? null;
    }
}

export async function deleteTask(id: number): Promise<void> {
    const db = await getDb();
    await db.execute('DELETE FROM tasks WHERE id=$1', [id]);
}
