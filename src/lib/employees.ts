import { getDb } from './db';

export interface AIEmployee {
    id?: number;
    name: string;
    role: string;
    api_url: string;
    api_key: string;
    model: string;
    system_prompt: string;
}

export async function getEmployees(): Promise<AIEmployee[]> {
    const db = await getDb();
    return await db.select<AIEmployee[]>('SELECT * FROM ai_employees ORDER BY id DESC');
}

export async function getEmployeeById(id: number): Promise<AIEmployee | null> {
    const db = await getDb();
    const res = await db.select<AIEmployee[]>('SELECT * FROM ai_employees WHERE id=$1', [id]);
    return res.length > 0 ? res[0] : null;
}

export async function createEmployee(emp: AIEmployee): Promise<void> {
    const db = await getDb();
    await db.execute(
        'INSERT INTO ai_employees (name, role, api_url, api_key, model, system_prompt) VALUES ($1, $2, $3, $4, $5, $6)',
        [emp.name, emp.role, emp.api_url, emp.api_key, emp.model, emp.system_prompt]
    );
}

export async function updateEmployee(id: number, emp: AIEmployee): Promise<void> {
    const db = await getDb();
    await db.execute(
        'UPDATE ai_employees SET name=$1, role=$2, api_url=$3, api_key=$4, model=$5, system_prompt=$6 WHERE id=$7',
        [emp.name, emp.role, emp.api_url, emp.api_key, emp.model, emp.system_prompt, id]
    );
}

export async function deleteEmployee(id: number): Promise<void> {
    const db = await getDb();
    await db.execute('DELETE FROM ai_employees WHERE id=$1', [id]);
}
