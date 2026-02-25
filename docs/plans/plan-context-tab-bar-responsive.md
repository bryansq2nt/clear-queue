# Plan: Responsive multiline context tab bar

**Status:** Implemented  
**Goal:** Fix overlapping icons and cramped layout in the project context tab menu by adding edge spacing and multiline wrap so the UI works on all viewport sizes.

---

## Problem

- The context tab bar has many options (Etapas, Responsable, Notas, Enlaces, Ideas, Presupuestos, Facturación, Tareas, Documentos, Salir).
- On narrow viewports (and even on wider ones with long labels), icons overlap and the bar feels cramped.
- There is no horizontal padding from the screen edges.
- Single-row layout forces either horizontal scroll or overlap.

---

## Design direction

1. **Edge spacing:** Add consistent horizontal padding to the tab bar container so content never touches the viewport edges (align with header padding: `px-4 md:px-6`).
2. **Multiline wrap:** Allow tabs to wrap to multiple rows using `flex-wrap`, with consistent gap between items, so we never rely on a single row for all tabs.
3. **Salir placement:** Keep "Salir" as a distinct action; when wrapped, it can sit at the end of the flow (last tab) or in a short second row — avoid it being lost in the middle of the list.
4. **No overlap:** Ensure each tab link has a minimum touch target (e.g. 44px) and `flex-shrink-0` so items never shrink and overlap.
5. **Active state:** Keep the current active indicator (green bottom border) and ensure it still reads clearly when tabs wrap.

---

## Phases

### Phase 1: Edge spacing and overflow behavior

- Add horizontal padding to the `<nav>` (e.g. `px-4 md:px-6`) to match the header and create clear edge spacing.
- Ensure the inner tab list is the only scrollable/wrappable area: one clear container for all tab links + Salir.
- Give each tab link a minimum size (e.g. `min-w-[44px]` or `py-3` + padding) and `flex-shrink-0` so they never shrink and overlap.
- Add a small gap between tab items (e.g. `gap-1` or `gap-2`) for consistent spacing.

**Files:** `components/context/ContextTabBar.tsx`

**Acceptance:** Tab bar has visible padding from left/right edges; no overlapping icons when resizing (either scroll or wrap).

---

### Phase 2: Multiline wrap layout

- Change the tab container to use `flex-wrap` so tabs flow to the next line when there isn’t enough width.
- Use a single flex container for all items (tabs + Salir) with `flex-wrap`, `gap-x-2`, `gap-y-1` (or similar), and `justify-center` or `justify-start` so wrapped rows look aligned.
- Keep "Salir" as the last item in the flex order so it appears at the end of the first row or at the start of the second row when wrapped.
- Remove the current three-column layout (spacer | tabs | Salir) in favor of one wrapped list; Salir is just the last link in the list.

**Files:** `components/context/ContextTabBar.tsx`

**Acceptance:** On narrow viewports, tabs wrap to two (or more) rows; no horizontal overlap; Salir remains visible and identifiable.

---

### Phase 3: Polish and accessibility

- Confirm active tab indicator (border-bottom) is visible and correct when the active tab is in the first or second row.
- Ensure focus order and aria labels are correct (existing `aria-label` on nav and exit link).
- Optionally: on very small screens, keep "icon + label" for the active tab only and icons-only for others to save space without losing context (optional; can skip if multiline is enough).
- Run Prettier and lint.

**Files:** `components/context/ContextTabBar.tsx`

**Acceptance:** Visual and keyboard UX is clear; lint and format pass.

---

## Files changed (summary)

| File                                            | Changes                                                                     |
| ----------------------------------------------- | --------------------------------------------------------------------------- |
| `components/context/ContextTabBar.tsx`          | Padding, flex-wrap, single list for tabs + Salir, gap, min size, no overlap |
| `docs/plans/plan-context-tab-bar-responsive.md` | This plan                                                                   |

---

## Risks / tradeoffs

- **Multiline height:** The tab bar will grow in height on narrow viewports. This is acceptable and preferred over overlap or tiny touch targets.
- **Salir position:** Salir as "last in list" may appear on the second row on mobile; that’s acceptable and keeps the layout simple. We are not adding a separate "row" for Salir to avoid extra layout logic.

---

## How to test

1. Open a project from the projects view and go to the project (context) view.
2. **Phase 1:** Resize the window; confirm the tab bar has padding from the left and right edges and tabs do not overlap (scroll or wrap).
3. **Phase 2:** On a narrow viewport (e.g. 320px or 375px), confirm tabs wrap to multiple rows and Salir is visible (last or start of second row).
4. **Phase 3:** Click through tabs; confirm the active green underline is correct. Use keyboard (Tab) to move focus and ensure order is logical. Run `npm run lint` and `npm run build`.

---

## Implemented (2026-02-24)

- **ContextTabBar.tsx:** Single wrapped flex container with `flex-wrap`, `justify-center`, `gap-x-2 gap-y-1`. Nav has `px-4 md:px-6` for edge spacing. Tabs only (no Salir). Each link has `min-h-[44px]`, `flex-shrink-0`, `rounded-t-md`; active state unchanged (border-primary). Decorative icons use `aria-hidden`.
- **ContextShell.tsx (follow-up):** "Salir" moved from tab bar to main header: right side of the green bar, next to the project title (right corner). Header layout: flex with justified title center and Salir in a right-aligned block; same exit behavior (slide transition when home data is ready, else navigate). Tab bar no longer receives `onExitStart`.
