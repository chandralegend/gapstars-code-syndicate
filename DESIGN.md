# Design

## Color Palette

Strategy: **Restrained** — tinted neutrals with one near-black primary and
semantic status tones as the only color on the surface. The product has enough
information density that color must communicate status, not brand.

| Token | Light mode | Dark mode | Usage |
|---|---|---|---|
| `--background` | `oklch(0.995 0.003 260)` | `oklch(0.05 0.003 260)` | Page, sidebar |
| `--foreground` | `oklch(0.13 0.005 260)` | `oklch(0.96 0.004 260)` | Primary text |
| `--card` | `oklch(1 0 0)` | `oklch(0.1 0.004 260)` | Card surface |
| `--muted` | `oklch(0.965 0.004 260)` | `oklch(0.155 0.005 260)` | Secondary bg |
| `--border` | `oklch(0.91 0.004 260)` | `oklch(0.20 0.005 260)` | Borders |
| `--ink-2` | `oklch(0.20 0.005 260)` | `oklch(0.84 0.005 260)` | Strong secondary |
| `--ink-3` | `oklch(0.45 0.005 260)` | `oklch(0.62 0.005 260)` | Tertiary text |
| `--ink-4` | `oklch(0.68 0.004 260)` | `oklch(0.48 0.005 260)` | Decorative only |
| `--ok` | `oklch(0.58 0.14 162)` | `oklch(0.72 0.17 162)` | Pass/success |
| `--ok-ink` | `oklch(0.36 0.10 162)` | `oklch(0.88 0.14 162)` | Success text |
| `--warn` | `oklch(0.74 0.16 75)` | `oklch(0.82 0.17 80)` | Review/warning |
| `--warn-ink` | `oklch(0.42 0.13 70)` | `oklch(0.90 0.14 80)` | Warning text |
| `--err` | `oklch(0.58 0.22 25)` | `oklch(0.70 0.20 25)` | Error/fail |
| `--err-ink` | `oklch(0.38 0.18 25)` | `oklch(0.88 0.16 25)` | Error text |

No pure `oklch(0 0 0)` or `oklch(1 0 0)`. Every neutral is tinted toward
hue 260 (blue-grey) at chroma 0.003–0.005.

## Typography

Single family: **Geist** (sans) + **Geist Mono** for data, code, IDs,
timestamps, and event payloads.

| Role | Size | Weight | Usage |
|---|---|---|---|
| Display | 28px | 600 | Page titles |
| Title | 20–24px | 600 | Section headers |
| Body strong | 15px | 500 | Card titles, node labels |
| Body | 14px | 400 | Default prose, descriptions |
| Secondary | 13px | 400 | Table cells, supporting text |
| Small | 12px | 400 | Badges, hints, timestamps |
| Micro | 11px | 400 | Metadata only, never interactive labels |
| Mono | 12–13px | 400–500 | IDs, paths, event payloads, code |

Line height: 1.5 body, 1.375 compact (tables, timeline events), 1.2 headings.
Letter spacing: -0.01em on semibold headings; 0.18em on small uppercase labels.

## Spacing

4dp grid: `4 8 12 16 24 32 48 64 96`.

Avoid half-steps (6px, 10px, 14px, 20px) except for optical fine-tuning of
icon/text alignment. Avoid arbitrary values in className.

## Elevation & Borders

No drop shadows. Separation via:
1. Background tint difference (card vs page, sidebar vs content)
2. 1px borders using `--border`
3. Opacity/tint for hover states

Shadows are reserved for floating panels (tooltips, dropdowns, popovers) and
use `0 2px 8px oklch(0.13 0.005 260 / 0.12)`.

## Border Radius

| Token | Value | Usage |
|---|---|---|
| `rounded-sm` | 4px | Badges, kbd, inline code |
| `rounded-md` | 6px | Buttons, inputs, small cards |
| `rounded-lg` | 8px | Cards, panels, NodeCards |
| `rounded-xl` | 10px | Modals, larger panels |
| `rounded-full` | 9999px | Pills, avatar circles |

## Components

**Button hierarchy**: accent (near-black fill) > ghost (transparent) > link.
No "primary" overloaded for multiple actions per screen. One accent action per
view maximum.

**Timeline NodeCard**: `rounded-lg border` with tone-mapped borders
(`border-ok/30`, `border-err/40`, `border-warn/40`, `border-accent/40`).
Left-border left-border accents on active items replaced with a subtle
left pill (3px, `before:` pseudo) — never `border-left` > 1px as a color accent.

**Status dot**: 6px circle, `aria-hidden`, always accompanied by text.
Pulse animation on running state only, gated behind `motion-safe:`.

**Badge**: `rounded-full`, height `h-5`, `text-xs`. Semantic variants only.

## Motion

- Default transition: `transition-colors duration-150` on interactive elements.
- Page-level: no orchestrated load animations.
- State changes (NodeCard expand, tab switch): `150ms ease-out`.
- Review gate: deliberate fade (`200ms ease-out`) on backdrop dim.
- Respect `prefers-reduced-motion` via global `@media` block.

## Theme

Physical scene: **a QA engineer at their desk, mid-afternoon, 1440px monitor,
task-focused.** Light mode default. Dark mode available via toggle; both
first-class. Neither is the "default" — the toggle persists via `next-themes`.

## Sidebar

Dark in dark mode; near-white (tinted, not pure white) in light mode.
Active item: 3px left-pill indicator, not background fill, to avoid collision
with badge accent tones. Width: 232px. Collapses to icon rail.
