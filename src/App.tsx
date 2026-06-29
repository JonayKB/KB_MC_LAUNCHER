import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import NavbarComponent from './components/NavbarComponent';
import HomeScreen from './screens/HomeScreen';
import TerminalsScreen from './screens/TerminalsScreen';
import './styles/global.css';
import LiveScreen from './screens/LiveScreen';
import { getCurrentWindow } from '@tauri-apps/api/window';
import RalliesScreen from './screens/RalliesScreen';
import { SeasonScreen } from './screens/SeasonScreen';
import TracksScreen from './screens/TracksScreen';
import PilotsScreen from './screens/PilotScreen';
import SquadsScreen from './screens/SquadsScreen';
const isLiveScreen = getCurrentWindow().label === 'live';

function AppLayout() {
  return (
    <div className="app-layout">
      {/* Drawer navbar — se superpone sobre el contenido */}
      {!isLiveScreen && <NavbarComponent />}

      {/* Contenido principal con espacio para el trigger */}
      <main className="app-content" style={{ paddingTop: '64px' }}>
        <Routes>
          <Route path="/" element={<HomeScreen />} />
          <Route path="/terminals" element={<TerminalsScreen />} />
          <Route path="/live" element={<LiveScreen />} />
          <Route path="/rallies" element={<RalliesScreen />} />
          <Route path="/seasons" element={<SeasonScreen />} />
          <Route path="/tracks" element={<TracksScreen />} />
          <Route path="/pilots" element={<PilotsScreen />} />
          <Route path="/squads" element={<SquadsScreen />} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <AppLayout />
      </BrowserRouter>
    </ThemeProvider>
  );
}