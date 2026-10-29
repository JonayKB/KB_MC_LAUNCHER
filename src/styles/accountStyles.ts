import type React from 'react';
type S = React.CSSProperties;

export const accounts = {
  avatarImg: (size: number): S => ({
    width: size,
    height: size,
    flexShrink: 0,
    borderRadius: 'var(--radius-md)',
    imageRendering: 'pixelated',
    border: '1px solid var(--border)',
  }),

  avatarFallback: (size: number): S => ({
    width: size,
    height: size,
    flexShrink: 0,
    borderRadius: 'var(--radius-md)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--accent-dim)',
    border: '1px solid var(--accent-border)',
    color: 'var(--accent)',
    fontFamily: 'var(--font-condensed)',
    fontWeight: 800,
    fontSize: Math.round(size * 0.45),
  }),

  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    padding: '12px',
    maxHeight: '320px',
    overflowY: 'auto',
  } as S,

  row: (hovered: boolean, active: boolean): S => ({
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '8px 10px',
    borderRadius: 'var(--radius-md)',
    cursor: 'pointer',
    background: active ? 'var(--bg-hover)' : hovered ? 'var(--bg-elevated)' : 'transparent',
    borderLeft: active ? '2px solid var(--accent)' : '2px solid transparent',
    transition: 'background-color 0.15s',
  }),

  rowText: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    flex: 1,
    minWidth: 0,
  } as S,

  rowName: {
    fontSize: '14px',
    fontWeight: 500,
    color: 'var(--text-primary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  } as S,

  rowType: (online: boolean): S => ({
    fontFamily: 'var(--font-condensed)',
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: online ? 'var(--success)' : 'var(--text-faint)',
  }),

  activeTag: {
    fontFamily: 'var(--font-condensed)',
    fontSize: '10px',
    fontWeight: 700,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: 'var(--accent)',
    padding: '2px 8px',
    borderRadius: 'var(--radius-sm)',
    background: 'var(--accent-dim)',
    border: '1px solid var(--accent-border)',
  } as S,

  removeBtn: (visible: boolean): S => ({
    width: '28px',
    height: '28px',
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'none',
    border: 'none',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    opacity: visible ? 1 : 0,
    transition: 'opacity 0.15s',
  }),

  footer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    padding: '16px 24px 20px',
    borderTop: '1px solid var(--border)',
  } as S,

  actions: {
    display: 'flex',
    gap: '8px',
  } as S,

  actionBtn: (primary: boolean, disabled: boolean): S => ({
    flex: 1,
    height: '38px',
    borderRadius: 'var(--radius-md)',
    border: primary ? 'none' : '1px solid var(--border-strong)',
    background: primary ? 'var(--accent)' : 'transparent',
    color: primary ? '#fff' : 'var(--text-secondary)',
    fontFamily: 'var(--font-condensed)',
    fontSize: '13px',
    fontWeight: 700,
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.6 : 1,
  }),

  offlineForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  } as S,
} as const;
