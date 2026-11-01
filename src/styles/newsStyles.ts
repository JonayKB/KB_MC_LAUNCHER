import type React from 'react';
type S = React.CSSProperties;

export const news = {
    list: {
        display: 'flex',
        flexDirection: 'column',
        gap: '18px',
        maxHeight: '420px',
        overflowY: 'auto',
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
