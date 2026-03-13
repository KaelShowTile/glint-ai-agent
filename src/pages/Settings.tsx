import { useTheme } from '../hooks/useTheme';

export default function Settings() {
    const { theme, toggleTheme } = useTheme();

    return (
        <div className="p-8 max-w-3xl mx-auto h-full">
            <h1 className="text-3xl font-bold mb-6">Global Settings</h1>

            <div className="bg-card border border-border rounded-lg p-6 space-y-6">
                <div>
                    <h2 className="text-xl font-semibold mb-2">Appearance</h2>
                    <p className="text-muted-foreground text-sm mb-4">Choose your preferred application theme.</p>
                    <div className="flex items-center justify-between p-4 border border-border rounded-lg bg-background">
                        <span>Theme Mode</span>
                        <button
                            onClick={toggleTheme}
                            className="px-4 py-2 rounded-md font-medium capitalize bg-accent text-accent-foreground hover:opacity-90"
                        >
                            Toggle to {theme === 'light' ? 'Dark' : 'Light'}
                        </button>
                    </div>
                </div>

                <div className="pt-6 border-t border-border">
                    <h2 className="text-xl font-semibold mb-2">API Keys Base</h2>
                    <p className="text-muted-foreground text-sm mb-4">
                        Note: You define API Keys per AI Employee in the Employees tab, or per individual task via Custom AI overrides.
                        This ensures maximum flexibility for token management.
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
        </div>
    )
}
