import { useTheme } from '../hooks/useTheme';
import { useTranslation, Language } from '../lib/i18n';

export default function Settings() {
    const { theme, toggleTheme } = useTheme();
    const { t, lang, setLang } = useTranslation();

    return (
        <div className="p-8 max-w-3xl mx-auto h-full">
            <h1 className="text-3xl font-bold mb-6">{t('settings_title')}</h1>

            <div className="bg-card border border-border rounded-lg p-6 space-y-6">
                <div>
                    <h2 className="text-xl font-semibold mb-2">{t('settings_appearance')}</h2>
                    <p className="text-muted-foreground text-sm mb-4">{t('settings_appearance_desc')}</p>
                    <div className="flex items-center justify-between p-4 border border-border rounded-lg bg-background mb-4">
                        <span>{t('settings_theme_mode')}</span>
                        <button
                            onClick={toggleTheme}
                            className="px-4 py-2 rounded-md font-medium capitalize bg-accent text-accent-foreground hover:opacity-90"
                        >
                            {t('settings_toggle')} {theme === 'light' ? 'Dark' : 'Light'}
                        </button>
                    </div>

                    <h2 className="text-xl font-semibold mb-2">{t('settings_lang')}</h2>
                    <p className="text-muted-foreground text-sm mb-4">{t('settings_lang_desc')}</p>
                    <div className="flex items-center justify-between p-4 border border-border rounded-lg bg-background">
                        <span>{t('settings_lang')}</span>
                        <select
                            value={lang}
                            onChange={e => setLang(e.target.value as Language)}
                            className="bg-accent text-accent-foreground px-4 py-2 border border-border rounded-md font-medium"
                        >
                            <option value="en">English</option>
                            <option value="zh">简体中文</option>
                        </select>
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
