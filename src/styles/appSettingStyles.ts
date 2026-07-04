import type React from 'react';
type S = React.CSSProperties;

export const appSettings = {
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
    maxWidth: '440px',
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
  } as S,

  row: (hovered: boolean, danger?: boolean): S => ({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    borderRadius: 'var(--radius-md)',
    backgroundColor: hovered ? 'var(--bg-hover)' : 'transparent',
    cursor: 'pointer',
    transition: 'background-color 0.15s',
    gap: '12px',
  }),

  rowLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    minWidth: 0,
  } as S,

  rowIcon: (danger?: boolean): S => ({
    width: '32px',
    height: '32px',
    borderRadius: 'var(--radius-md)',
    background: danger ? 'var(--accent-dim)' : 'var(--bg-elevated)',
    border: `1px solid ${danger ? 'var(--accent-border)' : 'var(--border)'}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    color: danger ? 'var(--accent)' : 'var(--text-muted)',
  }),

  rowText: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1px',
    minWidth: 0,
  } as S,

  rowLabel: (danger?: boolean): S => ({
    fontSize: '14px',
    fontWeight: 500,
    color: danger ? 'var(--accent)' : 'var(--text-primary)',
    whiteSpace: 'nowrap',
  }),

  rowDesc: {
    fontSize: '11px',
    color: 'var(--text-faint)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  } as S,

  toggle: (active: boolean): S => ({
    width: '38px',
    height: '22px',
    borderRadius: '11px',
    background: active ? 'var(--accent)' : 'var(--bg-hover)',
    border: 'none',
    cursor: 'pointer',
    position: 'relative',
    flexShrink: 0,
    transition: 'background-color 0.15s',
  }),

  toggleKnob: (active: boolean): S => ({
    position: 'absolute',
    top: '3px',
    left: active ? '19px' : '3px',
    width: '16px',
    height: '16px',
    borderRadius: '50%',
    background: '#fff',
    transition: 'left 0.15s',
  }),

  divider: {
    height: '1px',
    background: 'var(--border)',
    margin: '4px 8px',
  } as S,

  footer: {
    padding: '12px 24px',
    borderTop: '1px solid var(--border)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
  } as S,

  version: {
    fontFamily: 'var(--font-condensed)',
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.08em',
    color: 'var(--text-faint)',
  } as S,
} as const;