import React, { useEffect, useState } from 'react';
import { ModpackEntry } from '../types';
import { fetchModpackIndex } from '../repositories/ModpackRepository';
import { box, header, layout, logo, text } from '../styles/components';

interface Props {
    onSelect: (modpack: ModpackEntry) => void;
}

export default function ModpackSelectScreen({ onSelect }: Readonly<Props>) {
    const [modpacks, setModpacks] = useState<ModpackEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [hoveredId, setHoveredId] = useState<string | null>(null);

    useEffect(() => {
        fetchModpackIndex()
            .then(idx => setModpacks(idx.modpacks))
            .catch(e => setError(String(e)))
            .finally(() => setLoading(false));
    }, []);

    return (
        <div style={layout.fullscreenCenter}>
            <div style={{ ...layout.card, maxWidth: '560px' }}>

                <div style={header.zone}>
                    <div style={logo.wrap}>
                        <span style={logo.kb}>KB</span>
                        <span style={logo.dot}>·</span>
                        <span style={logo.text}>LAUNCHER</span>
                    </div>
                    <div style={header.iconWrap}>
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
                            stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
                        </svg>
                    </div>
                    <h2 style={header.title}>Selecciona un modpack</h2>
                    <p style={header.subtitle}>Modpacks disponibles del servidor MCKBServers</p>
                </div>

                {loading && (
                    <div style={box.status}>
                        <div style={layout.row}>
                            <div style={{
                                width: '14px', height: '14px',
                                border: '2px solid var(--accent)',
                                borderTopColor: 'transparent',
                                borderRadius: '50%',
                                flexShrink: 0,
                                animation: 'spin 0.8s linear infinite',
                            }} />
                            <span style={text.status}>Cargando modpacks...</span>
                        </div>
                    </div>
                )}

                {error && (
                    <div style={box.error}>
                        <div style={layout.row}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                                stroke="var(--accent)" strokeWidth="2" strokeLinecap="round">
                                <circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" />
                            </svg>
                            <span style={text.error}>{error}</span>
                        </div>
                    </div>
                )}

                {!loading && !error && modpacks.length === 0 && (
                    <div style={box.info}>
                        <span style={text.info}>No hay modpacks disponibles.</span>
                    </div>
                )}

                {!loading && !error && modpacks.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {modpacks.map(mp => (
                            <div
                                key={mp.id}
                                style={{
                                    ...cardStyle,
                                    borderColor: hoveredId === mp.id ? 'var(--accent)' : 'var(--border)',
                                    backgroundColor: hoveredId === mp.id ? 'var(--accent-dim)' : 'var(--bg-elevated)',
                                    cursor: 'pointer',
                                }}
                                onMouseEnter={() => setHoveredId(mp.id)}
                                onMouseLeave={() => setHoveredId(null)}
                                onClick={() => onSelect(mp)}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                                    {mp.imageUrl ? (
                                        <img
                                            src={mp.imageUrl}
                                            alt={mp.name}
                                            style={{ width: '48px', height: '48px', borderRadius: '6px', objectFit: 'cover', flexShrink: 0 }}
                                        />
                                    ) : (
                                        <div style={placeholderIcon}>
                                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                                                stroke="var(--text-faint)" strokeWidth="1.5" strokeLinecap="round">
                                                <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
                                            </svg>
                                        </div>
                                    )}
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={mpName}>{mp.name}</div>
                                        {mp.description && (
                                            <div style={mpDesc}>{mp.description}</div>
                                        )}
                                    </div>
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                                        stroke={hoveredId === mp.id ? 'var(--accent)' : 'var(--text-faint)'}
                                        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                                        style={{ flexShrink: 0, transition: 'stroke 0.15s' }}>
                                        <path d="M9 18l6-6-6-6" />
                                    </svg>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

            </div>
        </div>
    );
}

const cardStyle: React.CSSProperties = {
    border: '1px solid var(--border)',
    borderRadius: '8px',
    padding: '14px 16px',
    transition: 'border-color 0.15s, background-color 0.15s',
};

const placeholderIcon: React.CSSProperties = {
    width: '48px',
    height: '48px',
    borderRadius: '6px',
    background: 'var(--bg-hover)',
    border: '1px solid var(--border)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
};

const mpName: React.CSSProperties = {
    fontFamily: 'var(--font-condensed)',
    fontSize: '16px',
    fontWeight: 700,
    color: 'var(--text-primary)',
    letterSpacing: '0.02em',
    marginBottom: '4px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
};

const mpDesc: React.CSSProperties = {
    fontSize: '12px',
    color: 'var(--text-muted)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
};