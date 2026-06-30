import type React from 'react';
type S = React.CSSProperties;

export const detail = {
    screen: (bgUrl: string | null): S => ({
        position: 'relative',
        height: '100vh',
        width: '100%',
        overflow: 'hidden',
        backgroundColor: 'var(--bg-base)',
        backgroundImage: bgUrl ? `url(${bgUrl})` : undefined,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        transition: 'background-image 0.8s ease-in-out',
    }),

    overlay: {
        position: 'absolute',
        inset: 0,
        background:
            'linear-gradient(180deg, rgba(8,8,9,0.2) 0%, rgba(8,8,9,0.55) 55%, rgba(8,8,9,0.95) 100%)',
    } as S,

    content: {
        position: 'relative',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
        padding: '48px 56px',
        boxSizing: 'border-box',
    } as S,

    infoRow: {
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        gap: '24px',
    } as S,

    textCol: {
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        maxWidth: '640px',
    } as S,

    title: {
        fontFamily: 'var(--font-condensed)',
        fontSize: '40px',
        fontWeight: 800,
        color: '#fff',
        margin: 0,
        letterSpacing: '0.01em',
    } as S,

    metaRow: {
        display: 'flex',
        alignItems: 'center',
        gap: '14px',
        flexWrap: 'wrap',
    } as S,

    metaTag: {
        fontFamily: 'var(--font-condensed)',
        fontSize: '13px',
        fontWeight: 700,
        letterSpacing: '0.04em',
        color: 'rgba(255,255,255,0.85)',
        background: 'rgba(255,255,255,0.08)',
        border: '1px solid rgba(255,255,255,0.15)',
        borderRadius: 'var(--radius-md)',
        padding: '4px 10px',
    } as S,

    actionsCol: {
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        flexShrink: 0,
    } as S,

    playButton: {
        fontFamily: 'var(--font-condensed)',
        fontSize: '16px',
        fontWeight: 800,
        letterSpacing: '0.05em',
        textTransform: 'uppercase',
        color: '#fff',
        background: 'var(--accent)',
        border: 'none',
        borderRadius: 'var(--radius-md)',
        padding: '14px 36px',
        cursor: 'pointer',
        transition: 'background-color 0.15s, transform 0.1s',
    } as S,

    menuWrap: {
        position: 'relative',
    } as S,

    menuButton: {
        width: '48px',
        height: '48px',
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(255,255,255,0.08)',
        border: '1px solid rgba(255,255,255,0.15)',
        borderRadius: 'var(--radius-md)',
        color: '#fff',
        cursor: 'pointer',
        transition: 'background-color 0.15s',
    } as S,

    menuButtonHover: {
        background: 'rgba(255,255,255,0.16)',
    } as S,

    dropdown: {
        position: 'absolute',
        bottom: 'calc(100% + 8px)',
        right: 0,
        minWidth: '180px',
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
        overflow: 'hidden',
        zIndex: 20,
    } as S,

    dropdownItem: (hovered: boolean, danger?: boolean): S => ({
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '11px 16px',
        fontSize: '14px',
        fontWeight: 500,
        color: danger ? 'var(--error-text)' : 'var(--text-primary)',
        backgroundColor: hovered ? 'var(--bg-hover)' : 'transparent',
        cursor: 'pointer',
        transition: 'background-color 0.12s',
    }),

    dropdownIcon: {
        width: '16px',
        height: '16px',
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
    } as S,

    dropdownDivider: {
        height: '1px',
        background: 'var(--border)',
        margin: '4px 0',
    } as S,

    loadingText: {
        color: 'var(--text-muted)',
        fontSize: '16px',
    } as S,
} as const;

export const loading = {
    wrap: {
        height: '100%',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '16px',
    } as S,

    spinner: {
        width: '36px',
        height: '36px',
        border: '3px solid var(--border)',
        borderTopColor: 'var(--accent)',
        borderRadius: '50%',
        animation: 'spin 0.8s linear infinite',
    } as S,

    text: {
        fontFamily: 'var(--font-condensed)',
        fontSize: '13px',
        fontWeight: 700,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: 'var(--text-faint)',
    } as S,
} as const;