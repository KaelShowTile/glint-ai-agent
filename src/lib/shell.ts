import { Command } from '@tauri-apps/plugin-shell';

// Add new command prefixes here. These will run instantly without prompting the user.
export const COMMAND_ALLOWLIST = [
    'npm run',
    'npm test',
    'npm run build',
    'git status',
    'git log',
    'git diff',
    'ls',
    'dir',
    'echo',
    'cat',
    'type',
    'tsc',
    'node'
];

/**
 * Checks if a command string falls under the explicit safe green-list.
 */
export function isCommandAllowed(commandString: string): boolean {
    const trimmed = commandString.trim();
    for (const allowed of COMMAND_ALLOWLIST) {
        if (trimmed.startsWith(allowed)) return true;
    }
    return false;
}

/**
 * Spawns an internal Git command to take a safety snapshot of the working directory.
 * Will initialize git if not already present.
 */
export async function autoGitSnapshot(projectWorkingDir: string): Promise<string> {
    try {
        // Run git init (safe even if already initialized)
        const init = await Command.create('git', ['init'], { cwd: projectWorkingDir }).execute();
        
        // Run git add .
        const add = await Command.create('git', ['add', '.'], { cwd: projectWorkingDir }).execute();
        
        // Run git commit
        const commit = await Command.create('git', ['commit', '-m', 'Auto-backup before AI execution'], { cwd: projectWorkingDir }).execute();
        
        return `${init.stdout}\n${add.stdout}\n${commit.stdout}`;
    } catch (e: any) {
        // If git is not installed or errors, we just log it. In a strict setup, we might throw.
        console.warn('Auto Git Snapshot failed/skipped:', e);
        return `Git Snapshot disabled or failed: ${e.message}`;
    }
}

/**
 * Executes a shell command inside the user's project directory.
 * Returns the stdout + stderr.
 */
export async function executeShellCommand(commandString: string, projectWorkingDir: string): Promise<string> {
    try {
        // Use powershell on windows or sh on others. 
        // We'll use powershell for Windows since the prompt mentions Windows OS.
        const command = Command.create('powershell', ['-Command', commandString], { cwd: projectWorkingDir });
        const result = await command.execute();
        
        let output = result.stdout || '';
        if (result.stderr) {
            output += `\n[STDERR]:\n${result.stderr}`;
        }
        
        return output || '(Command executed successfully with no output)';
    } catch (e: any) {
        return `[EXECUTION CRASH]: ${e.message || e.toString()}`;
    }
}
