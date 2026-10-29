import type React from 'react';
import type { ModpackStatus } from '../hooks/useModpackOverview';
type S = React.CSSProperties;

const statusColor: Record<ModpackStatus, string> = {
  'installed': 'var(--success)',
  'update-available': 'var(--warning)',
  'not-installed': 'var(--text-faint)',
};

const condensedLabel: S = {
  fontFamily: 'var(--font-condensed)',
  fontWeight: 700,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
};

export const home = {
  screen: {
    minHeight: '100vh',
    padding: '36px 40px 32px',
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) 320px',
    gap: '28px',
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
    top: '36px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  } as S,

  headerRow: {
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: '16px',
    flexWrap: 'wrap',
  } as S,

  eyebrow: {
    ...condensedLabel,
    fontSize: '12px',
    letterSpacing: '0.14em',
    color: 'var(--accent)',
  } as S,

  title: {
    margin: '6px 0 0',
    fontFamily: 'var(--font-condensed)',
    fontSize: '36px',
    fontWeight: 800,
    lineHeight: 1.05,
    color: 'var(--text-primary)',
  } as S,

  sectionTitle: {
    ...condensedLabel,
    margin: 0,
    fontSize: '13px',
    color: 'var(--text-faint)',
  } as S,

  // ── Hero ────────────────────────────────────────────────────
  hero: (imageUrl?: string): S => ({
    position: 'relative',
    minHeight: '300px',
    borderRadius: 'var(--radius-xl)',
    border: '1px solid var(--border)',
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'flex-end',
    background: imageUrl
      ? `linear-gradient(90deg, rgba(8,8,9,0.92) 0%, rgba(8,8,9,0.6) 50%, rgba(8,8,9,0.15) 100%), url(${imageUrl}) center / cover`
      : 'linear-gradient(135deg, var(--accent-dim) 0%, var(--bg-elevated) 100%)',
  }),

  heroContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    padding: '28px 32px',
    maxWidth: '560px',
  } as S,

  heroEyebrow: {
    ...condensedLabel,
    fontSize: '11px',
    letterSpacing: '0.14em',
    color: 'var(--accent)',
  } as S,

  heroTitle: {
    margin: 0,
    fontFamily: 'var(--font-condensed)',
    fontSize: '44px',
    fontWeight: 800,
    lineHeight: 1,
    color: '#fff',
  } as S,

  heroDesc: {
    margin: 0,
    fontSize: '14px',
    lineHeight: 1.5,
    color: 'rgba(255,255,255,0.75)',
    display: '-webkit-box',
    WebkitLineClamp: 3,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  } as S,

  tagRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
  } as S,

  tag: {
    ...condensedLabel,
    fontSize: '11px',
    letterSpacing: '0.06em',
    padding: '3px 8px',
    borderRadius: 'var(--radius-sm)',
    background: 'rgba(255,255,255,0.1)',
    border: '1px solid rgba(255,255,255,0.15)',
    color: 'rgba(255,255,255,0.85)',
  } as S,

  heroActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    marginTop: '4px',
    flexWrap: 'wrap',
  } as S,

  primaryBtn: (hovered: boolean, disabled: boolean): S => ({
    ...condensedLabel,
    height: '44px',
    padding: '0 28px',
    borderRadius: 'var(--radius-md)',
    border: 'none',
    background: hovered && !disabled ? 'var(--accent-hover)' : 'var(--accent)',
    color: '#fff',
    fontSize: '15px',
    letterSpacing: '0.08em',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.6 : 1,
    transition: 'background-color 0.15s',
  }),

  ghostBtn: (hovered: boolean): S => ({
    ...condensedLabel,
    height: '44px',
    padding: '0 18px',
    borderRadius: 'var(--radius-md)',
    border: '1px solid rgba(255,255,255,0.2)',
    background: hovered ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.06)',
    color: '#fff',
    fontSize: '13px',
    cursor: 'pointer',
    transition: 'background-color 0.15s',
  }),

  heroError: {
    fontSize: '12px',
    color: 'var(--error-text)',
    maxWidth: '480px',
    wordBreak: 'break-word',
  } as S,

  heroSkeleton: {
    minHeight: '300px',
    borderRadius: 'var(--radius-xl)',
    background: 'var(--bg-surface)',
    border: '1px solid var(--border)',
    animation: 'pulse 1.4s ease-in-out infinite',
  } as S,

  // ── Stats ───────────────────────────────────────────────────
  stats: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
    gap: '12px',
  } as S,

  stat: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '14px 16px',
    borderRadius: 'var(--radius-xl)',
    background: 'var(--bg-surface)',
    border: '1px solid var(--border)',
    minWidth: 0,
  } as S,

  statIcon: {
    width: '36px',
    height: '36px',
    flexShrink: 0,
    borderRadius: 'var(--radius-md)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--accent-dim)',
    border: '1px solid var(--accent-border)',
    color: 'var(--accent)',
  } as S,

  statText: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    minWidth: 0,
  } as S,

  statLabel: {
    ...condensedLabel,
    fontSize: '10px',
    color: 'var(--text-faint)',
  } as S,

  statValue: {
    fontSize: '15px',
    fontWeight: 500,
    color: 'var(--text-primary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  } as S,

  statHint: {
    fontSize: '11px',
    color: 'var(--text-muted)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  } as S,

  // ── Rejilla de modpacks ─────────────────────────────────────
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
    gap: '14px',
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
    position: 'relative',
    height: '120px',
    background: url
      ? `linear-gradient(180deg, transparent 40%, rgba(8,8,9,0.6) 100%), url(${url}) center / cover`
      : 'linear-gradient(135deg, var(--accent-dim) 0%, var(--bg-elevated) 100%)',
  }),

  statusBadge: (status: ModpackStatus): S => ({
    ...condensedLabel,
    position: 'absolute',
    top: '10px',
    left: '10px',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '10px',
    padding: '3px 8px',
    borderRadius: 'var(--radius-sm)',
    background: 'rgba(8,8,9,0.75)',
    color: statusColor[status],
  }),

  statusDot: (status: ModpackStatus): S => ({
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    background: statusColor[status],
  }),

  cardBody: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    padding: '12px 14px 14px',
  } as S,

  cardName: {
    fontFamily: 'var(--font-condensed)',
    fontSize: '18px',
    fontWeight: 800,
    color: 'var(--text-primary)',
  } as S,

  cardMeta: {
    fontSize: '11px',
    color: 'var(--text-faint)',
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

  skeletonCard: (i: number): S => ({
    height: '220px',
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
    ...condensedLabel,
    height: '34px',
    padding: '0 14px',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--border-strong)',
    background: 'transparent',
    color: 'var(--text-secondary)',
    letterSpacing: '0.05em',
    cursor: 'pointer',
  } as S,

  // ── Novedades ───────────────────────────────────────────────
  panel: {
    marginTop: '12px',
    padding: '18px 20px',
    borderRadius: 'var(--radius-xl)',
    background: 'var(--bg-surface)',
    border: '1px solid var(--border)',
  } as S,

  changelog: {
    margin: 0,
    fontFamily: 'var(--font-body)',
    fontSize: '13px',
    lineHeight: 1.6,
    color: 'var(--text-secondary)',
    whiteSpace: 'pre-wrap',
    maxHeight: '220px',
    overflowY: 'auto',
  } as S,

  // ── Accesos rápidos ─────────────────────────────────────────
  linkRow: (hovered: boolean): S => ({
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    width: '100%',
    padding: '10px 12px',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    background: hovered ? 'var(--bg-hover)' : 'transparent',
    color: 'var(--text-secondary)',
    fontSize: '13px',
    textAlign: 'left',
    cursor: 'pointer',
    transition: 'background-color 0.15s',
  }),
} as const;
