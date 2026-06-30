import { BrowserRouter, Routes, Route } from 'react-router-dom';
import HomeScreen from './screens/HomeScreen';
import ModpackDetailScreen from './screens/ModpackDetailScreen';
import NavbarComponent from './components/NavbarComponent';

export default function App() {
    return (
        <BrowserRouter>

            <NavbarComponent />

            <Routes>
                <Route path="/" element={<HomeScreen />} />
                <Route path="/modpacks/:id" element={<ModpackDetailScreen />} />
            </Routes>
        </BrowserRouter>
    )
}