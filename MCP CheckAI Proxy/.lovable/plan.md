# Make the workbench visually congruent (light mode only)

The app is one dense, monospace "developer workbench" surface. The core panels (Panel, Uef, Validation, McpMapping, EventObject) already speak one consistent language: semantic tokens, `rounded-lg/xl` borders, `font-mono text-[10px] uppercase tracking` labels. But a cluster of components was built in a different, one-off style and never brought in line. That mismatch is what reads as "incongruent." Dark mode is explicitly out of scope.

## Two concrete problems

### 1. Semantic status colors are used but never defined
`text-success`, `bg-warning`, `text-info`, `border-info`, `bg-finance` appear in `HarnessConsole` and `ModelComparisonDialog`, but **none of these tokens exist** in `src/styles.css`. They silently render as no color, so status states look flat/broken and differ from the hand-rolled `emerald/amber` states elsewhere.

### 2. ~90 hardcoded palette colors bypass the theme
Whole components were styled in raw `slate-*`, `white`, `emerald-*`, `amber-*` instead of tokens. Worst offenders:
- `TrainingSetDialog` (~30), `LogPanel` (~15), `FilePreview`, `TestSuiteDialog`, `GeneratorDialog`, `DiversityDashboard`, plus stray `emerald/amber` in `AgentRuntimePanel`, `ValidationPanel`, `EventObjectPanel`, `index.tsx`.

These use a different green/amber/grey than the rest of the app — the single biggest source of visual drift.

## The fix

### Step 1 — Define the missing tokens (`src/styles.css`)
Add `success`, `warning`, `info`, `finance` (each with a `-foreground`) to `:root` and the `@theme inline` block, in `oklch`, tuned for readable contrast. This gives every status state one canonical color pair. (No `.dark` values — dark mode omitted.)

### Step 2 — Sweep hardcoded colors to tokens
Replace raw palette utilities with semantic equivalents across the offending components:
- `slate-50/100/200 → muted / border / card`
- `slate-400/500/600/700 → muted-foreground / foreground`
- `bg-white → bg-card`, `border-slate-* → border-border`
- `emerald-* → success`, `amber-* → warning`, any error reds → `destructive`

Mechanical, low-risk, one component at a time.

### Step 3 — Normalize the small stuff
- Standardize panel-internal label tracking on one value (`tracking-[0.14em]`) instead of the current mix of `0.12/0.14/0.16/0.18em`.
- Settle inner cards on `rounded-lg` (reserve `rounded-xl` for the outer `Panel`).
- Remove the stray blank lines / unused icon imports at the top of `index.tsx`.

## Files touched
- `src/styles.css` (light tokens only)
- `TrainingSetDialog.tsx`, `LogPanel.tsx`, `FilePreview.tsx`, `TestSuiteDialog.tsx`, `GeneratorDialog.tsx`, `DiversityDashboard.tsx`, `AgentRuntimePanel.tsx`, `ValidationPanel.tsx`, `EventObjectPanel.tsx`, `HarnessConsole.tsx`, `ModelComparisonDialog.tsx`, `src/routes/index.tsx`

## Out of scope
- Dark mode (no `.dark` token changes, no dark-brand fix).
- No layout restructure, no new features, no copy changes, no logic changes.
- shadcn `ui/*` overlay `bg-black/80` stays (standard primitive).

## Verification
Build clean, then eyeball the workbench in light mode — every status color, button, and panel should now draw from the same token set.