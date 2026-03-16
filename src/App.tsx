import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Projects from './pages/Projects';
import Employees from './pages/Employees';
import Settings from './pages/Settings';
import ProjectWorkspace from './pages/ProjectWorkspace';
import { I18nProvider } from './lib/i18n';

export default function App() {
  return (
    <I18nProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Projects />} />
            <Route path="project/:id" element={<ProjectWorkspace />} />
            <Route path="employees" element={<Employees />} />
            <Route path="settings" element={<Settings />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </I18nProvider>
  );
}
