import { BrowserRouter, Routes, Route } from 'react-router-dom';
import HomeScreen from './screens/HomeScreen';
import ModpackDetailScreen from './screens/ModpackDetailScreen';
import NavbarComponent from './components/NavbarComponent';
import { COLLAPSED_WIDTH } from './styles/navbarStyles';
import AccountSelectorModal from './components/AccountModal';
import { useState } from 'react';

export default function App() {
    const [accountSelectorOpen, setAccountSelectorOpen] = useState(false);

    {
        accountSelectorOpen && (
            <AccountSelectorModal onClose={() => setAccountSelectorOpen(false)} />
        )
    }
    return (
        <BrowserRouter>
            <div style={{ display: 'flex' }}>
                <NavbarComponent />
                <button onClick={() => setAccountSelectorOpen(true)} style={{ position: 'fixed', top: 10, right: 10, zIndex: 300 }}>
                    Abrir selector de cuentas
                </button>
                {accountSelectorOpen && (
                    <AccountSelectorModal onClose={() => setAccountSelectorOpen(false)} />
                )}
                <main
                    style={{
                        marginLeft: COLLAPSED_WIDTH,
                        width: '100%',
                        minHeight: '100vh',
                    }}
                >
                    <Routes>
                        <Route path="/" element={<HomeScreen />} />
                        <Route path="/modpacks/:id" element={<ModpackDetailScreen />} />
                    </Routes>
                </main>
            </div>
        </BrowserRouter>
    );
}