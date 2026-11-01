import type React from 'react';
type S = React.CSSProperties;

export const news = {
    panel: {
        flex: '0 1 auto',
        minHeight: '180px',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        padding: '16px 6px 16px 16px',
        borderRadius: 'var(--radius-xl)',
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
    } as S,

    panelTitle: {
        margin: 0,
        fontFamily: 'var(--font-condensed)',
        fontWeight: 700,
        fontSize: '13px',
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        color: 'var(--text-faint)',
    } as S,

    list: {
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: '18px',
        overflowY: 'auto',
        paddingRight: '10px',
    } as S,

    message: {
        display: 'flex',
        gap: '12px',
        minWidth: 0,
    } as S,

    avatar: {
        width: '32px',
        height: '32px',
        borderRadius: '50%',
        flexShrink: 0,
        objectFit: 'cover',
    } as S,

    avatarFallback: {
        width: '32px',
        height: '32px',
        borderRadius: '50%',
        flexShrink: 0,
        background: 'var(--bg-hover)',
    } as S,

    body: {
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        minWidth: 0,
        flex: 1,
    } as S,

    meta: {
        display: 'flex',
        alignItems: 'baseline',
        gap: '8px',
        flexWrap: 'wrap',
    } as S,

    author: {
        fontSize: '13px',
        fontWeight: 700,
        color: 'var(--text-primary)',
    } as S,

    date: {
        fontSize: '12px',
        color: 'var(--text-muted)',
    } as S,

    discordLink: {
        marginLeft: 'auto',
        padding: 0,
        border: 'none',
        background: 'none',
        fontFamily: 'inherit',
        fontSize: '12px',
        color: 'var(--text-muted)',
        cursor: 'pointer',
    } as S,

    content: {
        margin: 0,
        fontSize: '13px',
        lineHeight: 1.6,
        color: 'var(--text-secondary)',
        whiteSpace: 'pre-wrap',
        overflowWrap: 'anywhere',
    } as S,

    inlineLink: {
        color: 'var(--accent)',
    } as S,

    markdown: {
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        minWidth: 0,
    } as S,

    heading: (level: 1 | 2 | 3): S => ({
        margin: '4px 0 0',
        fontFamily: 'var(--font-condensed)',
        fontSize: `${19 - level}px`,
        fontWeight: 800,
        lineHeight: 1.2,
        color: 'var(--text-primary)',
        overflowWrap: 'anywhere',
    }),

    subtext: {
        fontSize: '11.5px',
        lineHeight: 1.5,
        color: 'var(--text-muted)',
        overflowWrap: 'anywhere',
    } as S,

    quote: {
        margin: 0,
        paddingLeft: '10px',
        borderLeft: '3px solid var(--border-strong)',
    } as S,

    bulletList: {
        margin: 0,
        paddingLeft: '18px',
        fontSize: '13px',
        lineHeight: 1.6,
        color: 'var(--text-secondary)',
        overflowWrap: 'anywhere',
    } as S,

    inlineCode: {
        padding: '1px 4px',
        borderRadius: 'var(--radius-sm)',
        background: 'var(--bg-hover)',
        fontFamily: 'monospace',
        fontSize: '12px',
    } as S,

    codeBlock: {
        margin: 0,
        padding: '8px 10px',
        borderRadius: 'var(--radius-md)',
        background: 'var(--bg-hover)',
        fontFamily: 'monospace',
        fontSize: '12px',
        lineHeight: 1.5,
        color: 'var(--text-secondary)',
        whiteSpace: 'pre-wrap',
        overflowWrap: 'anywhere',
    } as S,

    spoiler: (revealed: boolean): S => ({
        borderRadius: 'var(--radius-sm)',
        background: 'var(--bg-hover)',
        color: revealed ? 'inherit' : 'transparent',
        cursor: revealed ? 'text' : 'pointer',
    }),

    poll: {
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        padding: '12px',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--border)',
        background: 'var(--bg-elevated)',
    } as S,

    pollQuestion: {
        fontSize: '13px',
        fontWeight: 700,
        color: 'var(--text-primary)',
        overflowWrap: 'anywhere',
    } as S,

    pollAnswer: {
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
        padding: '7px 10px',
        borderRadius: 'var(--radius-sm)',
        background: 'var(--bg-hover)',
        overflow: 'hidden',
    } as S,

    pollBar: (percent: number, won: boolean): S => ({
        position: 'absolute',
        inset: 0,
        width: `${percent}%`,
        background: won ? 'var(--accent)' : 'var(--border-strong)',
        opacity: won ? 0.35 : 0.5,
    }),

    pollAnswerText: (won: boolean): S => ({
        position: 'relative',
        minWidth: 0,
        fontSize: '13px',
        fontWeight: won ? 700 : 500,
        color: 'var(--text-primary)',
        overflowWrap: 'anywhere',
    }),

    pollVotes: {
        position: 'relative',
        flexShrink: 0,
        fontSize: '12px',
        color: 'var(--text-secondary)',
    } as S,

    pollFooter: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
        flexWrap: 'wrap',
    } as S,

    pollVote: {
        padding: 0,
        border: 'none',
        background: 'none',
        fontFamily: 'inherit',
        fontSize: '12px',
        fontWeight: 700,
        color: 'var(--accent)',
        cursor: 'pointer',
    } as S,

    image: {
        display: 'block',
        maxWidth: '100%',
        maxHeight: '220px',
        borderRadius: 'var(--radius-md)',
        objectFit: 'contain',
    } as S,
} as const;
