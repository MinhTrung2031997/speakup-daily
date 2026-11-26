import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import { useStore } from './lib/store';
import Today from './pages/Today';
import Chat from './pages/Chat';
import Listen from './pages/Listen';
import Phrases from './pages/Phrases';
import Words from './pages/Words';
import SayItBetter from './pages/SayItBetter';
import Replay from './pages/Replay';
import History from './pages/History';
import Progress from './pages/Progress';
import Profile from './pages/Profile';
import Settings from './pages/Settings';
import Welcome from './pages/Welcome';

export default function App() {
  const { state } = useStore();
  if (!state.settings.onboarded) return <Welcome />;
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Today />} />
          <Route path="listen" element={<Listen />} />
          <Route path="chat" element={<Chat />} />
          <Route path="phrases" element={<Phrases />} />
          <Route path="words" element={<Words />} />
          <Route path="say" element={<SayItBetter />} />
          <Route path="replay" element={<Replay />} />
          <Route path="history" element={<History />} />
          <Route path="progress" element={<Progress />} />
          <Route path="profile" element={<Profile />} />
          <Route path="settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
