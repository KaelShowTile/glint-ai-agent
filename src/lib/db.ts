import Database from '@tauri-apps/plugin-sql';

let dbInstance: Database | null = null;

export async function getDb(): Promise<Database> {
    try {
        if (!dbInstance) {
            dbInstance = await Database.load('sqlite:myaiapp.db');
        }
        return dbInstance;
    } catch (e: any) {
        alert("CRITICAL DB INIT ERROR: " + e.toString());
        throw e;
    }
}
