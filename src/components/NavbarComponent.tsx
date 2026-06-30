import { useEffect, useState } from "react";
import { ModpackEntry, ModpackIndex } from "../types";
import { fetchModpackIndex } from "../repositories/ModpackRepository";
import { navbar, item, settings } from "../styles/navbarStyles";
import { useLocation, useNavigate } from "react-router-dom";

export default function NavbarComponent() {
    const [modpacks, setModpacks] = useState<ModpackEntry[]>([]);

    const [expanded, setExpanded] = useState(false);
    const [hoveredId, setHoveredId] = useState<string | null>(null);
    const [settingsHovered, setSettingsHovered] = useState(false);
    const navigate = useNavigate();
    const location = useLocation();



    useEffect(() => {
        const fetchData = async () => {
            const modpacksData: ModpackIndex = await fetchModpackIndex();
            setModpacks(modpacksData.modpacks);
        };
        fetchData();
    }, []);


    return (
        <nav
            style={navbar.nav(expanded)}
            onMouseEnter={() => setExpanded(true)}
            onMouseLeave={() => setExpanded(false)}
        >
            <div style={navbar.list}>
                {modpacks.map((modpack: ModpackEntry) => {
                    const isActive = location.pathname === `/modpacks/${modpack.id}`;
                    return (
                        <a
                            key={modpack.id}
                            onClick={isActive ? () => { navigate('') } : () => navigate(`/modpacks/${modpack.id}`)}
                            style={item.link(hoveredId === modpack.id, isActive)}
                            onMouseEnter={() => setHoveredId(modpack.id)}
                            onMouseLeave={() => setHoveredId(null)}
                        >
                            <img src={modpack.imageUrl} alt={modpack.name} style={item.thumb(isActive)} />
                            <span style={item.name(expanded, isActive)}>{modpack.name}</span>
                        </a>
                    );
                })}
            </div>

            <div
                style={settings.wrap(settingsHovered)}
                onMouseEnter={() => setSettingsHovered(true)}
                onMouseLeave={() => setSettingsHovered(false)}
                onClick={() => navigate('/settings')}
            >
                <span style={settings.icon}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="3" />
                        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                    </svg>
                </span>
                <span style={settings.label(expanded)}>Ajustes</span>
            </div>
        </nav>
    );
}