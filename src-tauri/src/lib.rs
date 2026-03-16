// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

use std::fs;
use tauri::Manager;
use tauri_plugin_sql::{Migration, MigrationKind};
use std::path::PathBuf;
use base64::{Engine as _, engine::general_purpose};

#[tauri::command]
fn save_asset(project_path: String, file_type: String, file_name: String, base64_data: String) -> Result<String, String> {
    // Construct path: <Project Path>/Assets/<FileType>
    let mut target_dir = PathBuf::from(&project_path);
    target_dir.push("Assets");
    target_dir.push(&file_type);

    // Create directories if they don't exist
    if !target_dir.exists() {
        fs::create_dir_all(&target_dir).map_err(|e| e.to_string())?;
    }

    // Decode base64 and save
    let mut file_path = target_dir;
    file_path.push(&file_name);
    
    // Sometimes the base64 from front-end contains "data:image/png;base64," header.
    let b64 = if base64_data.contains(',') {
        base64_data.split(',').nth(1).unwrap_or(&base64_data)
    } else {
        &base64_data
    };

    let bytes = general_purpose::STANDARD.decode(b64).map_err(|e| e.to_string())?;
    fs::write(&file_path, bytes).map_err(|e| e.to_string())?;

    Ok(file_path.to_string_lossy().to_string())
}

#[tauri::command]
fn save_file(absolute_path: String, content: String) -> Result<String, String> {
    if let Some(parent) = std::path::Path::new(&absolute_path).parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&absolute_path, content).map_err(|e| e.to_string())?;
    Ok(absolute_path)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![
        Migration {
            version: 1,
            description: "create_initial_tables",
            sql: "
            CREATE TABLE IF NOT EXISTS projects (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                description TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                status TEXT DEFAULT 'active'
            );

            CREATE TABLE IF NOT EXISTS ai_employees (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                role TEXT,
                api_url TEXT,
                api_key TEXT,
                model TEXT,
                system_prompt TEXT
            );

            CREATE TABLE IF NOT EXISTS tasks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id INTEGER NOT NULL,
                title TEXT NOT NULL,
                description TEXT,
                status TEXT DEFAULT 'todo',
                assignee_type TEXT DEFAULT 'human',
                ai_id INTEGER,
                custom_api_config TEXT,
                deliverables TEXT,
                parent_task_ids TEXT,
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
                FOREIGN KEY (ai_id) REFERENCES ai_employees(id) ON DELETE SET NULL
            );

            CREATE TABLE IF NOT EXISTS project_comfyui_templates (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id INTEGER NOT NULL,
                template_name TEXT NOT NULL,
                workflow_json TEXT,
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS task_assets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                task_id INTEGER NOT NULL,
                file_type TEXT,
                local_path TEXT NOT NULL,
                FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
            );

            PRAGMA foreign_keys = ON;
            ",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "add_save_path_to_projects",
            sql: "ALTER TABLE projects ADD COLUMN save_path TEXT;",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "add_manager_ai_id_to_projects",
            sql: "ALTER TABLE projects ADD COLUMN manager_ai_id INTEGER;",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "add_chat_history_to_projects",
            sql: "ALTER TABLE projects ADD COLUMN chat_history TEXT;",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 5,
            description: "add_stage_to_projects",
            sql: "ALTER TABLE projects ADD COLUMN stage TEXT DEFAULT 'research';",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 6,
            description: "add_execution_and_skills_columns",
            sql: "
            ALTER TABLE projects ADD COLUMN is_running BOOLEAN DEFAULT 0;
            ALTER TABLE tasks ADD COLUMN chat_history TEXT;
            ALTER TABLE ai_employees ADD COLUMN skill_path TEXT;
            ",
            kind: MigrationKind::Up,
        }
    ];

    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:myaiapp.db", migrations)
                .build()
        )
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![save_asset, save_file, greet])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
