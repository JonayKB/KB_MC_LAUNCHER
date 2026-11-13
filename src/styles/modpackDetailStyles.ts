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

    endedNotice: {
        fontSize: '13px',
        lineHeight: 1.45,
        color: 'rgba(255,255,255,0.8)',
        background: 'rgba(8,8,9,0.6)',
        border: '1px solid rgba(255,255,255,0.12)',
        borderLeft: '3px solid var(--warning)',
        borderRadius: 'var(--radius-md)',
        padding: '10px 12px',
        backdropFilter: 'blur(6px)',
    } as S,

    actionsCol: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
        gap: '10px',
        flexShrink: 0,
    } as S,

    actionsRow: {
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
    } as S,

    /** Secundario: el principal sigue siendo Jugar */
    joinButton: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
        fontFamily: 'var(--font-condensed)',
        fontSize: '13px',
        fontWeight: 700,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        color: '#fff',
        background: 'rgba(255,255,255,0.08)',
        border: '1px solid rgba(255,255,255,0.15)',
        borderRadius: 'var(--radius-md)',
        padding: '10px 16px',
        backdropFilter: 'blur(6px)',
        transition: 'background-color 0.15s',
    } as S,

    joinButtonHover: {
        background: 'rgba(255,255,255,0.16)',
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

    dropdownItem: (hovered: boolean, danger?: boolean, disabled?: boolean): S => ({
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '11px 16px',
        fontSize: '14px',
        fontWeight: 500,
        color: disabled
            ? 'var(--text-faint)'
            : danger
                ? 'var(--error-text)'
                : 'var(--text-primary)',
        backgroundColor: !disabled && hovered ? 'var(--bg-hover)' : 'transparent',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
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

/** Servidor del modpack y progreso del jugador (cristal oscuro, como endedNotice) */
const glass: S = {
    background: 'rgba(8,8,9,0.6)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 'var(--radius-md)',
    backdropFilter: 'blur(6px)',
};

export const server = {
    strip: {
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '8px',
        fontSize: '13px',
        color: 'rgba(255,255,255,0.8)',
    } as S,

    dot: (online: boolean): S => ({
        width: '8px',
        height: '8px',
        borderRadius: '50%',
        flexShrink: 0,
        background: online ? 'var(--success)' : 'rgba(255,255,255,0.35)',
        boxShadow: online ? '0 0 0 3px rgba(34,197,94,0.18)' : 'none',
    }),

    strong: { color: '#fff' } as S,

    dim: { opacity: 0.6 } as S,

    sep: { opacity: 0.35 } as S,

    lag: { color: 'var(--warning)' } as S,

    linkBtn: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '5px',
        font: 'inherit',
        color: 'rgba(255,255,255,0.8)',
        background: 'none',
        border: 'none',
        padding: 0,
        cursor: 'pointer',
        textDecoration: 'underline',
        textDecorationColor: 'rgba(255,255,255,0.25)',
        textUnderlineOffset: '3px',
    } as S,

    progress: {
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        alignItems: 'flex-start',
    } as S,

    summary: {
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        fontSize: '13px',
        color: 'rgba(255,255,255,0.8)',
        background: 'none',
        border: 'none',
        padding: 0,
        cursor: 'pointer',
    } as S,

    panel: {
        ...glass,
        width: '420px',
        maxWidth: '100%',
        boxSizing: 'border-box',
        padding: '12px 14px',
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
    } as S,

    panelSection: {
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
    } as S,

    panelHead: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
        fontSize: '12px',
        color: 'rgba(255,255,255,0.8)',
    } as S,

    panelTitle: {
        fontFamily: 'var(--font-condensed)',
        fontSize: '11px',
        fontWeight: 700,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        color: 'rgba(255,255,255,0.55)',
    } as S,

    switch: {
        display: 'flex',
        padding: '2px',
        gap: '2px',
        borderRadius: 'var(--radius-sm)',
        background: 'rgba(255,255,255,0.06)',
    } as S,

    switchBtn: (active: boolean): S => ({
        fontFamily: 'var(--font-condensed)',
        fontSize: '11px',
        fontWeight: 700,
        letterSpacing: '0.04em',
        padding: '3px 8px',
        border: 'none',
        borderRadius: '3px',
        cursor: 'pointer',
        color: active ? '#fff' : 'rgba(255,255,255,0.55)',
        background: active ? 'rgba(255,255,255,0.14)' : 'transparent',
    }),

    grid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(5, 1fr)',
        gap: '6px',
    } as S,

    cell: {
        display: 'flex',
        flexDirection: 'column',
        gap: '1px',
        minWidth: 0,
    } as S,

    cellValue: {
        fontFamily: 'var(--font-condensed)',
        fontSize: '17px',
        fontWeight: 800,
        color: '#fff',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        fontVariantNumeric: 'tabular-nums',
    } as S,

    cellLabel: {
        fontSize: '11px',
        color: 'rgba(255,255,255,0.55)',
        whiteSpace: 'nowrap',
    } as S,

    rank: (podium: boolean): S => ({
        fontFamily: 'var(--font-condensed)',
        fontSize: '12px',
        fontWeight: 700,
        color: podium ? 'var(--accent)' : 'rgba(255,255,255,0.5)',
        minHeight: '15px',
    }),

    footnote: {
        fontSize: '11px',
        color: 'rgba(255,255,255,0.4)',
    } as S,

    sessionList: {
        listStyle: 'none',
        margin: 0,
        padding: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
    } as S,

    sessionRow: {
        display: 'flex',
        justifyContent: 'space-between',
        gap: '16px',
        fontSize: '12px',
        color: 'rgba(255,255,255,0.8)',
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
