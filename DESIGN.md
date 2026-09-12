# Keeptrail Design System

## Visual theme

Keeptrail is a desktop-first product UI for a quiet personal reference desk: a user is retrieving saved material in a dim-to-neutral workspace with one focused task in front of them. The default theme is warm graphite, not pure black. Surfaces are layered with restrained borders and no decorative blur, glow, or gradients.

## Color palette

Use semantic tokens rather than raw colors in components.

| Token | Value | Use |
| --- | --- | --- |
| `--canvas` | `oklch(13.4% 0.008 125)` | App background |
| `--surface` | `oklch(17.7% 0.009 125)` | Panels and cards |
| `--surface-raised` | `oklch(21% 0.009 125)` | Inputs, selected reading areas |
| `--text` | `oklch(95% 0.018 92)` | Primary text |
| `--text-secondary` | `oklch(78% 0.018 125)` | Metadata and supporting copy |
| `--text-muted` | `oklch(65% 0.014 125)` | Quiet labels |
| `--accent` | `oklch(72% 0.105 32)` | Primary action and current selection |
| `--accent-strong` | `oklch(76% 0.125 32)` | Hover and focus support |
| `--sage` | `oklch(78% 0.065 145)` | Development/design route |
| `--ochre` | `oklch(82% 0.105 90)` | Animation/learning route |
| `--lilac` | `oklch(77% 0.075 300)` | Typography/AI route |
| `--danger` | `oklch(71% 0.14 25)` | Destructive/error states with text/icons |
| `--success` | `oklch(77% 0.09 150)` | Completed states with text/icons |
| `--border` | `oklch(100% 0 0 / 0.12)` | 1px panel separators |
| `--border-strong` | `oklch(100% 0 0 / 0.2)` | Focused/selected boundaries |

Filled coral buttons use graphite text. Topic colors are always paired with labels, icons, or selection treatment.

## Typography

Use `-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif`. Body text is 16px with 1.5 line-height. Metadata is 13px. Page and panel titles are 20–24px with a modest 1.15–1.2 scale. Use tabular figures for timestamps, counts, and storage values. Keep prose to 65–75 characters per line when possible.

## Layout

Use a 4/8px spacing grid. The primary desktop shell has a compact toolbar, a 208px filter rail, a flexible result list with a 400px minimum, and a 360px detail panel at wide widths. Collapse the rail and use an accessible detail drawer below 1280px. Below 900px, stack results and connections and keep a list alternative available. Preserve selection and filters when switching Search and Explore.

## Components

- Controls are 40px high on desktop with 44px effective hit areas, 8px radii, visible focus rings, and clear pressed/disabled/loading states.
- Buttons use one primary coral action per screen; secondary actions are quiet bordered or text controls.
- Result rows are source-aware: thumbnail, title, platform, matching snippet, tags, and actual processing state.
- Detail panels separate AI analysis from user notes, show evidence inline, and label uncertain website extraction as “Needs checking”.
- Explore uses semantic SVG routes and stations with a keyboard/list alternative. It does not use force simulation or continuous motion.
- Empty, loading, error, waiting-for-key, needs-review, and success states teach the next action.

## Motion

Animate opacity and transforms only. Use 150–200ms ease-out transitions for state changes and shorter exits. Disable non-essential motion under `prefers-reduced-motion: reduce`. No autoplay, parallax, bouncing, or animated layout properties.

## Accessibility

Use semantic landmarks, sequential headings, `aria-label` for icon-only controls, `aria-live="polite"` for queue updates, keyboard navigation for every action, and visible `:focus-visible` rings. Keep normal text at 4.5:1 contrast or better. Provide explanatory text alongside status colors and keep browser zoom enabled.
