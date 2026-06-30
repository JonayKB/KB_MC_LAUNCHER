import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { ModpackVersion } from "../types";
import { fetchModpackVersion } from "../repositories/ModpackRepository";

export default function ModpackDetailScreen() {
    const { id } = useParams<{ id: string }>();
    const [modpack, setModpack] = useState<ModpackVersion | null>(null);

    useEffect(() => {
        const fetchData = async () => {
            if (id) {
                const modpackData: ModpackVersion = await fetchModpackVersion(id);
                console.log('Fetched modpack data:', modpackData);
                setModpack(modpackData);
            }
        };
        fetchData();
    }, [id]);

    return (
        <div style={{ padding: '20px' }}>
            {modpack ? (
                <>
                    <h1>{modpack.id}</h1>
                    <p>{modpack.minecraftVersion}</p>
                    <p>Version: {modpack.forgeVersion}</p>
                    <p>Modpack Id: {modpack.modpackId}</p>
                    <p>Mods url: {modpack.modsUrl}</p>
                    <p>Overrides url: {modpack.overridesUrl}</p>
                </>
            ) : (
                <p>Cargando información del modpack...</p>
            )}
        </div>
    );
}