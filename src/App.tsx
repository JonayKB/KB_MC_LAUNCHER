import { BrowserRouter, Routes, Route } from 'react-router-dom';
import HomeScreen from './screens/HomeScreen';
import ModpackDetailScreen from './screens/ModpackDetailScreen';
import NavbarComponent from './components/NavbarComponent';
import AccountWidget from './components/AccountWidget';
import InstallToast from './components/InstallToast';
import { InstallProvider } from './context/InstallContext';
import { COLLAPSED_WIDTH } from './styles/navbarStyles';

export default function App() {
    return (
        <BrowserRouter>
            <InstallProvider>
                <div style={{ display: 'flex' }}>
                    <NavbarComponent />
                    <AccountWidget />
                    <main
                        style={{
                            marginLeft: COLLAPSED_WIDTH,
                            flex: 1,
                            minWidth: 0,
                            minHeight: '100vh',
                        }}
                    >
                        <Routes>
                            <Route path="/" element={<HomeScreen />} />
                            <Route path="/modpacks/:id" element={<ModpackDetailScreen />} />
                        </Routes>
                    </main>
                </div>
                <InstallToast />
            </InstallProvider>
        </BrowserRouter>
    );
}
