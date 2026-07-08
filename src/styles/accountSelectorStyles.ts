import type React from 'react';
type S = React.CSSProperties;

export const accountSelector = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.7)',
    backdropFilter: 'blur(4px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 200,
  } as S,

  card: {
    width: '100%',
    maxWidth: '420px',
    background: 'var(--bg-surface)',
    border: '1px solid var(--border)',
    borderTop: '2px solid var(--accent)',
    borderRadius: 'var(--radius-xl)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  } as S,

  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '20px 24px 16px',
    borderBottom: '1px solid var(--border)',
  } as S,

  headerLeft: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  } as S,

  eyebrow: {
    fontFamily: 'var(--font-condensed)',
    fontSize: '10px',
    fontWeight: 700,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    color: 'var(--accent)',
  } as S,

  title: {
    fontFamily: 'var(--font-condensed)',
    fontSize: '18px',
    fontWeight: 800,
    color: 'var(--text-primary)',
  } as S,

  closeBtn: (hovered: boolean): S => ({
    width: '32px',
    height: '32px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: hovered ? 'var(--bg-hover)' : 'transparent',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-md)',
    color: hovered ? 'var(--text-primary)' : 'var(--text-faint)',
    cursor: 'pointer',
    transition: 'background-color 0.15s, color 0.15s',
  }),

  body: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    padding: '8px',
    maxHeight: '360px',
    overflowY: 'auto',
  } as S,

  accountRow: (hovered: boolean, active: boolean): S => ({
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '10px 12px',
    borderRadius: 'var(--radius-md)',
    backgroundColor: active
      ? 'var(--bg-hover)'
      : hovered ? 'var(--bg-elevated)' : 'transparent',
    borderLeft: active ? '2px solid var(--accent)' : '2px solid transparent',
    cursor: 'pointer',
    transition: 'background-color 0.15s',
  }),

  avatar: {
    width: '40px',
    height: '40px',
    borderRadius: 'var(--radius-md)',
    flexShrink: 0,
    imageRendering: 'pixelated',
    border: '1px solid var(--border)',
  } as S,

  avatarFallback: {
    width: '40px',
    height: '40px',
    borderRadius: 'var(--radius-md)',
    flexShrink: 0,
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--text-faint)',
    fontSize: '18px',
  } as S,

  accountInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    flex: 1,
    minWidth: 0,
  } as S,

  accountName: (active: boolean): S => ({
    fontFamily: 'var(--font-condensed)',
    fontSize: '15px',
    fontWeight: 700,
    color: active ? 'var(--accent)' : 'var(--text-primary)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  }),

  accountType: {
    fontSize: '11px',
    color: 'var(--text-faint)',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  } as S,

  activeBadge: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    background: 'var(--success)',
    flexShrink: 0,
  } as S,

  removeBtn: (hovered: boolean): S => ({
    width: '28px',
    height: '28px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: hovered ? 'var(--accent-dim)' : 'transparent',
    border: 'none',
    borderRadius: 'var(--radius-sm)',
    color: hovered ? 'var(--accent)' : 'var(--text-faint)',
    cursor: 'pointer',
    flexShrink: 0,
    transition: 'background-color 0.15s, color 0.15s',
  }),

  divider: {
    height: '1px',
    background: 'var(--border)',
    margin: '4px 8px',
  } as S,

  addRow: (hovered: boolean): S => ({
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '10px 12px',
    borderRadius: 'var(--radius-md)',
    backgroundColor: hovered ? 'var(--bg-elevated)' : 'transparent',
    cursor: 'pointer',
    transition: 'background-color 0.15s',
  }),

  addIcon: {
    width: '40px',
    height: '40px',
    borderRadius: 'var(--radius-md)',
    flexShrink: 0,
    background: 'var(--bg-elevated)',
    border: '1px dashed var(--border)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--text-faint)',
  } as S,

  addLabel: {
    fontFamily: 'var(--font-condensed)',
    fontSize: '14px',
    fontWeight: 700,
    color: 'var(--text-muted)',
  } as S,

  loggingIn: {
    padding: '16px',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    fontSize: '13px',
    color: 'var(--text-faint)',
  } as S,

  spinner: {
    width: '16px',
    height: '16px',
    border: '2px solid var(--border)',
    borderTopColor: 'var(--accent)',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
    flexShrink: 0,
  } as S,
} as const;