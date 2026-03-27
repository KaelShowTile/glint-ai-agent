import Database from '@tauri-apps/plugin-sql';

export interface ProjectInfo {
    id?: number;
    project_id: number;
    name: string;
    content: string;
    target_profession_id: number | null;
}

const dbPromise = Database.load('sqlite:myaiapp.db');

export async function getProjectInfos(projectId: number): Promise<ProjectInfo[]> {
    const db = await dbPromise;
    return await db.select<ProjectInfo[]>('SELECT * FROM project_info WHERE project_id = $1', [projectId]);
}

export async function saveProjectInfo(info: ProjectInfo): Promise<number> {
    const db = await dbPromise;
    if (info.id) {
        await db.execute(
            'UPDATE project_info SET name = $1, content = $2, target_profession_id = $3 WHERE id = $4',
            [info.name, info.content, info.target_profession_id, info.id]
        );
        return info.id;
    } else {
        const result = await db.execute(
            'INSERT INTO project_info (project_id, name, content, target_profession_id) VALUES ($1, $2, $3, $4)',
            [info.project_id, info.name, info.content, info.target_profession_id]
        );
        return result.lastInsertId as number;
    }
}

export async function deleteProjectInfo(id: number): Promise<void> {
    const db = await dbPromise;
    await db.execute('DELETE FROM project_info WHERE id = $1', [id]);
}
