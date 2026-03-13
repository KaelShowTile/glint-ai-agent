import { useState, useEffect } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { Users, Settings, Moon, Sun, Briefcase, ChevronLeft, ChevronRight } from 'lucide-react';
import { useTheme } from '../hooks/useTheme';

export default function Layout() {
    const { theme, toggleTheme } = useTheme();
    const location = useLocation();
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);

    useEffect(() => {
        if (location.pathname.startsWith('/project/')) {
            setIsSidebarOpen(false);
        } else {
            setIsSidebarOpen(true);
        }
    }, [location.pathname]);

    const navItems = [
        { name: 'Projects', path: '/', icon: Briefcase },
        { name: 'AI Employees', path: '/employees', icon: Users },
        { name: 'Settings', path: '/settings', icon: Settings },
    ];

    return (
        <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
            {/* Sidebar */}
            <aside className={`flex flex-col border-r border-border bg-card transition-all duration-300 relative ${isSidebarOpen ? 'w-64' : 'w-16 items-center'}`}>
                <button
                    onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                    className="absolute -right-3 top-5 bg-card border border-border rounded-full p-0.5 z-20 hover:text-primary transition-colors focus:outline-none"
                    title={isSidebarOpen ? "Collapse Sidebar" : "Expand Sidebar"}
                >
                    {isSidebarOpen ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
                </button>
                <div className={`h-14 flex items-center border-b border-border font-bold text-lg w-full ${isSidebarOpen ? 'px-4' : 'justify-center'}`}>
                    {isSidebarOpen ? 'MyAIAgent' : 'AI'}
                </div>
                <nav className="flex-1 p-4 space-y-1">
                    {navItems.map((item) => {
                        const isActive = location.pathname === item.path || (location.pathname.startsWith(item.path) && item.path !== '/');
                        return (
                            <Link
                                key={item.path}
                                to={item.path}
                                title={!isSidebarOpen ? item.name : undefined}
                                className={`flex items-center rounded-md transition-colors ${isSidebarOpen ? 'gap-3 px-3 py-2 w-full' : 'justify-center p-2 w-10 h-10'
                                    } ${isActive
                                        ? 'bg-primary text-primary-foreground'
                                        : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                                    }`}
                            >
                                <item.icon size={18} className="shrink-0" />
                                {isSidebarOpen && <span className="truncate">{item.name}</span>}
                            </Link>
                        )
                    })}
                </nav>
                <div className={`p-4 border-t border-border mt-auto w-full flex ${isSidebarOpen ? '' : 'justify-center'}`}>
                    <button
                        onClick={toggleTheme}
                        title={!isSidebarOpen ? (theme === 'light' ? 'Dark Mode' : 'Light Mode') : undefined}
                        className={`flex items-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors ${isSidebarOpen ? 'gap-3 px-3 py-2 w-full' : 'justify-center p-2 w-10 h-10'
                            }`}
                    >
                        {theme === 'light' ? <Moon size={18} className="shrink-0" /> : <Sun size={18} className="shrink-0" />}
                        {isSidebarOpen && <span className="truncate">{theme === 'light' ? 'Dark Mode' : 'Light Mode'}</span>}
                    </button>
                </div>
            </aside>

            {/* Main Content Area */}
            <main className="flex-1 flex flex-col min-w-0 bg-background">
                <div className="flex-1 overflow-auto">
                    <Outlet />
                </div>
            </main>
        </div>
    );
}
