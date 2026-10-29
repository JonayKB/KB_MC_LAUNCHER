import type React from 'react';
type S = React.CSSProperties;

export const home = {
  screen: {
    minHeight: '100vh',
    padding: '40px 40px 32px',
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) 340px',
    gap: '32px',
    alignItems: 'start',
  } as S,

  main: {
    display: 'flex',
    flexDirection: 'column',
    gap: '28px',
    minWidth: 0,
  } as S,

  side: {
    position: 'sticky',
    top: '40px',
  } as S,

  eyebrow: {
    fontFamily: 'var(--font-condensed)',
    fontSize: '12px',
    fontWeight: 700,
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    color: 'var(--accent)',
  } as S,

  title: {
    margin: '6px 0 0',
    fontFamily: 'var(--font-condensed)',
    fontSize: '40px',
    fontWeight: 800,
    lineHeight: 1.05,
    color: 'var(--text-primary)',
  } as S,

  subtitle: {
    margin: '8px 0 0',
    fontSize: '15px',
    color: 'var(--text-muted)',
  } as S,

  sectionTitle: {
    margin: 0,
    fontFamily: 'var(--font-condensed)',
    fontSize: '14px',
    fontWeight: 700,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: 'var(--text-faint)',
  } as S,

  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
    gap: '16px',
    marginTop: '12px',
  } as S,

  card: (hovered: boolean): S => ({
    display: 'flex',
    flexDirection: 'column',
    textAlign: 'left',
    padding: 0,
    borderRadius: 'var(--radius-xl)',
    border: `1px solid ${hovered ? 'var(--accent-border)' : 'var(--border)'}`,
    background: 'var(--bg-surface)',
    overflow: 'hidden',
    cursor: 'pointer',
    color: 'inherit',
    font: 'inherit',
    transform: hovered ? 'translateY(-2px)' : 'none',
    boxShadow: hovered ? '0 10px 28px rgba(0,0,0,0.35)' : 'none',
    transition: 'transform 0.15s, box-shadow 0.15s, border-color 0.15s',
  }),

  cardImage: (url?: string): S => ({
    height: '132px',
    background: url
      ? `linear-gradient(180deg, transparent 40%, rgba(8,8,9,0.6) 100%), url(${url}) center / cover`
      : 'linear-gradient(135deg, var(--accent-dim) 0%, var(--bg-elevated) 100%)',
  }),

  cardBody: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    padding: '14px 16px 16px',
  } as S,

  cardName: {
    fontFamily: 'var(--font-condensed)',
    fontSize: '18px',
    fontWeight: 800,
    color: 'var(--text-primary)',
  } as S,

  cardDesc: {
    fontSize: '13px',
    lineHeight: 1.45,
    color: 'var(--text-muted)',
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  } as S,

  cardCta: (hovered: boolean): S => ({
    marginTop: '6px',
    fontFamily: 'var(--font-condensed)',
    fontSize: '12px',
    fontWeight: 700,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: hovered ? 'var(--accent)' : 'var(--text-faint)',
    transition: 'color 0.15s',
  }),

  skeletonCard: (i: number): S => ({
    height: '230px',
    borderRadius: 'var(--radius-xl)',
    background: 'var(--bg-surface)',
    border: '1px solid var(--border)',
    animation: 'pulse 1.4s ease-in-out infinite',
    animationDelay: `${i * 0.15}s`,
  }),

  empty: {
    marginTop: '12px',
    padding: '24px',
    borderRadius: 'var(--radius-xl)',
    border: '1px dashed var(--border-strong)',
    color: 'var(--text-muted)',
    fontSize: '14px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '16px',
  } as S,

  retryBtn: {
    height: '34px',
    padding: '0 14px',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--border-strong)',
    background: 'transparent',
    color: 'var(--text-secondary)',
    fontFamily: 'var(--font-condensed)',
    fontWeight: 700,
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
    cursor: 'pointer',
  } as S,
} as const;
