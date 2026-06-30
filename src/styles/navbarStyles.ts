import type React from 'react';

type S = React.CSSProperties;

export const COLLAPSED_WIDTH = 64;
export const EXPANDED_WIDTH = 240;

export const navbar = {
  nav: (expanded: boolean): S => ({
    position: 'fixed',
    top: 0,
    left: 0,
    height: '100vh',
    width: expanded ? EXPANDED_WIDTH : COLLAPSED_WIDTH,
    background: 'var(--bg-surface)',
    borderRight: '1px solid var(--border)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    padding: '12px 0',
    overflow: 'hidden',
    transition: 'width 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
    zIndex: 100,
  }),

  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    width: '100%',
    flex: 1,
    overflowY: 'auto',
    overflowX: 'hidden',
  } as S,
} as const;


export const item = {
  link: (hovered: boolean, active: boolean): S => ({
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '6px 12px',
    width: '100%',
    boxSizing: 'border-box',
    textDecoration: 'none',
    borderRadius: 'var(--radius-md)',
    whiteSpace: 'nowrap',
    backgroundColor: active
      ? 'var(--bg-hover)'
      : hovered
        ? 'var(--bg-elevated)'
        : 'transparent',
    borderLeft: active ? '2px solid var(--accent)' : '2px solid transparent',
    transition: 'background-color 0.15s, border-color 0.15s',
    cursor: 'pointer',
  }),

  thumb: (active: boolean): S => ({
    width: '40px',
    height: '40px',
    flexShrink: 0,
    borderRadius: 'var(--radius-lg)',
    objectFit: 'cover',
    border: active ? '1px solid var(--accent)' : '1px solid var(--border)',
  }),

  name: (expanded: boolean, active: boolean): S => ({
    fontFamily: 'var(--font-condensed)',
    fontSize: '14px',
    fontWeight: 700,
    letterSpacing: '0.03em',
    color: active ? 'var(--accent)' : 'var(--text-primary)',
    opacity: expanded ? 1 : 0,
    width: expanded ? 'auto' : 0,
    overflow: 'hidden',
    transition: expanded
      ? 'opacity 0.15s 0.1s, width 0.15s'
      : 'opacity 0.1s, width 0.1s',
  }),
} as const;


export const settings = {
  wrap: (hovered: boolean): S => ({
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '10px 12px',
    width: '100%',
    boxSizing: 'border-box',
    marginTop: '8px',
    borderTop: '1px solid var(--border)',
    paddingTop: '14px',
    cursor: 'pointer',
    borderRadius: 'var(--radius-md)',
    whiteSpace: 'nowrap',
    color: hovered ? 'var(--text-primary)' : 'var(--text-faint)',
    backgroundColor: hovered ? 'var(--bg-hover)' : 'transparent',
    transition: 'background-color 0.15s, color 0.15s',
  }),


  icon: {
    width: '40px',
    height: '40px',
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  } as S,

  label: (expanded: boolean): S => ({
    fontFamily: 'var(--font-condensed)',
    fontSize: '13px',
    fontWeight: 700,
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
    opacity: expanded ? 1 : 0,
    width: expanded ? 'auto' : 0,
    overflow: 'hidden',
    transition: expanded
      ? 'opacity 0.15s 0.1s, width 0.15s'
      : 'opacity 0.1s, width 0.1s',
  }),
} as const;