import { NavLink, Outlet } from 'react-router-dom';
import { useStore } from '../lib/store';
import ImportBanner from './ImportBanner';
import { isDue } from '../lib/srs';
import Icon from './Icon';

const NAV = [
  { to: '/', label: 'Today', icon: 'home' },
  { to: '/listen', label: 'Listen', icon: 'headphones' },
  { to: '/chat', label: 'Chat', icon: 'chat' },
  { to: '/phrases', label: 'Phrases', icon: 'cards' },
  { to: '/words', label: 'Words', icon: 'book' },
  { to: '/say', label: 'Say it', icon: 'translate' },
  { to: '/history', label: 'History', icon: 'history' },
  { to: '/progress', label: 'Progress', icon: 'chart' },
];

export default function Layout() {
  const { state, update, saveError } = useStore();
  const due = state.phrases.filter((p) => isDue(p)).length + state.sounds.filter((x) => isDue(x)).length;
  const toggleDark = () => update((s) => ({ ...s, settings: { ...s.settings, dark: !s.settings.dark } }));
  const demo = state.settings.demo;

  return (
    <div className="min-h-screen pb-24 md:pb-10">
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/85 backdrop-blur dark:border-slate-800 dark:bg-slate-950/85">
        <div className="mx-auto flex h-14 max-w-4xl items-center gap-3 px-4">
          <NavLink to="/" className="flex items-center gap-2 font-bold text-slate-900 dark:text-white">
            <img src="/favicon.svg" alt="" className="h-7 w-7" />
            <span>SpeakUp <span className="text-blue-600 dark:text-blue-400">Daily</span></span>
          </NavLink>
          {demo && <span className="chip bg-amber-100 text-amber-800 dark:bg-amber-400/20 dark:text-amber-200">Demo mode</span>}
          <nav className="ml-4 hidden gap-1 md:flex">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.to === '/'} className={({ isActive }) => `relative rounded-lg px-3 py-1.5 text-sm font-medium ${isActive ? 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-200' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`}>
                {n.label}
                {n.to === '/phrases' && due > 0 && <span className="ml-1 rounded-full bg-amber-400 px-1.5 text-[10px] font-bold text-amber-950">{due}</span>}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-1">
            <button onClick={toggleDark} className="btn-ghost !p-2" title="Toggle dark mode" aria-label="Toggle dark mode">
              <Icon name={state.settings.dark ? 'sun' : 'moon'} />
            </button>
            <NavLink to="/profile" className={({ isActive }) => `btn-ghost !p-2 ${isActive ? 'text-blue-600 dark:text-blue-300' : ''}`} title="Profile & topics" aria-label="Profile">
              <Icon name="user" />
            </NavLink>
            <NavLink to="/settings" className={({ isActive }) => `btn-ghost !p-2 ${isActive ? 'text-blue-600 dark:text-blue-300' : ''}`} title="Settings" aria-label="Settings">
              <Icon name="settings" />
            </NavLink>
          </div>
        </div>
      </header>

      {saveError && <div className="bg-rose-600 px-4 py-2 text-center text-sm text-white">{saveError}</div>}

      <main className="mx-auto max-w-4xl px-4 py-5">
        <ImportBanner />
        <Outlet />
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur dark:border-slate-800 dark:bg-slate-950/95 md:hidden">
        <div className="mx-auto flex max-w-md">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === '/'} className={({ isActive }) => `relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${isActive ? 'text-blue-600 dark:text-blue-400' : 'text-slate-500 dark:text-slate-400'}`}>
              <Icon name={n.icon} className="h-6 w-6" />
              {n.label}
              {n.to === '/phrases' && due > 0 && <span className="absolute right-[22%] top-1 rounded-full bg-amber-400 px-1.5 text-[10px] font-bold text-amber-950">{due}</span>}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
