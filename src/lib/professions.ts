import { getDb } from './db';

export interface Profession {
    id?: number;
    name: string;
    description: string;
    system_prompt: string;
}

export async function getProfessions(): Promise<Profession[]> {
    const db = await getDb();
    return await db.select<Profession[]>('SELECT * FROM professions ORDER BY id DESC');
}

export async function getProfessionById(id: number): Promise<Profession | null> {
    const db = await getDb();
    const res = await db.select<Profession[]>('SELECT * FROM professions WHERE id=$1', [id]);
    return res.length > 0 ? res[0] : null;
}

export async function createProfession(prof: Profession): Promise<void> {
    const db = await getDb();
    await db.execute(
        'INSERT INTO professions (name, description, system_prompt) VALUES ($1, $2, $3)',
        [prof.name, prof.description, prof.system_prompt]
    );
}

export async function updateProfession(id: number, prof: Profession): Promise<void> {
    const db = await getDb();
    await db.execute(
        'UPDATE professions SET name=$1, description=$2, system_prompt=$3 WHERE id=$4',
        [prof.name, prof.description, prof.system_prompt, id]
    );
}

export async function deleteProfession(id: number): Promise<void> {
    const db = await getDb();
    await db.execute('DELETE FROM professions WHERE id=$1', [id]);
}
