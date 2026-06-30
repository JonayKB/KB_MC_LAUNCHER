import type React from 'react';
type S = React.CSSProperties;

export const discordCard = {
    wrap: (bannerUrl: string | null): S => ({
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        width: '360px',
        borderRadius: 'var(--radius-xl)',
        border: '1px solid var(--border)',
        overflow: 'hidden',
        backgroundColor: 'var(--bg-elevated)',
        backgroundImage: bannerUrl
            ? `linear-gradient(180deg, rgba(8,8,9,0.3) 0%, rgba(8,8,9,0.95) 80%), url(${bannerUrl})`
            : 'linear-gradient(135deg, var(--accent-dim) 0%, var(--bg-elevated) 100%)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        boxShadow: '0 8px 32px rgba(0,0,0,0.45)',
        zIndex: 50,

    }),

    content: {
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        padding: '18px',
    } as S,

    topRow: {
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
    } as S,

    icon: {
        width: '48px',
        height: '48px',
        borderRadius: 'var(--radius-lg)',
        border: '2px solid var(--bg-surface)',
        flexShrink: 0,
        objectFit: 'cover',
    } as S,

    headerText: {
        display: 'flex',
        flexDirection: 'column',
        gap: '2px',
        minWidth: 0,
    } as S,

    eyebrow: {
        fontFamily: 'var(--font-condensed)',
        fontSize: '10px',
        fontWeight: 700,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        color: 'var(--accent)',
    } as S,

    name: {
        fontFamily: 'var(--font-condensed)',
        fontSize: '17px',
        fontWeight: 800,
        color: '#fff',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
    } as S,

    desc: {
        fontSize: '12.5px',
        color: 'rgba(255,255,255,0.7)',
        lineHeight: 1.4,
    } as S,

    membersRow: {
        display: 'flex',
        alignItems: 'center',
        gap: '14px',
    } as S,

    memberStat: {
        display: 'flex',
        alignItems: 'center',
        gap: '5px',
        fontSize: '12px',
        fontWeight: 600,
        color: 'rgba(255,255,255,0.85)',
    } as S,

    dot: (color: string): S => ({
        width: '7px',
        height: '7px',
        borderRadius: '50%',
        background: color,
        boxShadow: `0 0 6px ${color}`,
    }),

    required: {
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        fontSize: '11px',
        fontWeight: 700,
        color: 'var(--accent)',
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
    } as S,

    button: {
        fontFamily: 'var(--font-condensed)',
        fontSize: '13px',
        fontWeight: 800,
        letterSpacing: '0.05em',
        textTransform: 'uppercase',
        color: '#fff',
        background: 'var(--accent)',
        border: 'none',
        borderRadius: 'var(--radius-md)',
        padding: '10px',
        width: '100%',
        cursor: 'pointer',
        transition: 'background-color 0.15s',
    } as S,
} as const;