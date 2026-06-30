import { BrowserRouter, Routes, Route } from 'react-router-dom';
import HomeScreen from './screens/HomeScreen';
import ModpackDetailScreen from './screens/ModpackDetailScreen';
import NavbarComponent from './components/NavbarComponent';
import { COLLAPSED_WIDTH } from './styles/navbarStyles';

export default function App() {
    return (
        <BrowserRouter>
            <div style={{ display: 'flex' }}>
                <NavbarComponent />
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