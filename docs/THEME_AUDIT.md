# Theme Audit – Hardcoded Light Surfaces

**Purpose:** Track locations with `bg-white`, `bg-slate-50`, `gray-50`, etc. that break dark mode.
**Tokens to use instead:** `bg-background`, `bg-card`, `bg-surface-1`, `bg-surface-2`, `bg-surface-3`, `bg-muted`, `text-foreground`, `text-muted-foreground`.

## Offending locations (to fix)

### Dashboard ✅ (Milestone 2 fixed)
- `components/AnalyticsDashboard.tsx` – Blocked Tasks / Upcoming Deadlines: `bg-card`, blocked task items dark-friendly
- `components/dashboard/TaskListWidget.tsx` – Pagination: `bg-card border-border`, text: `text-foreground`

### Idea Graph ✅ (Milestone 3 fixed)
- `app/ideas/IdeasDashboardClient.tsx`, `app/ideas/boards/[id]/canvas/page.tsx` – White bar → `bg-card border-border`
- `app/ideas/IdeaGraphCanvas.tsx` – CARD_COLORS dark variants
- `app/ideas/boards/[id]/canvas/BoardCanvas.client.tsx` – Node border → `border-border`

### Billings ✅ (Milestone 4 fixed)
- Table header → `bg-surface-2`, rows → `border-border hover:bg-accent/50`
- STATUS_COLORS dark variants, SummaryCard tokens

### Project Task Board (Kanban) ✅ (Milestone 5 fixed)
- `components/ProjectKanbanClient.tsx` – Main → `bg-background`
- `components/Column.tsx` – Columns → `bg-surface-2`, headers with tint
- `components/TaskCard.tsx` – Cards → `bg-card`, priority dark variants
- `components/RightPanel.tsx` – Text tokens

### Budgets
- `app/budgets/[id]/components/CategorySection.tsx:105,108` – `bg-white`, `bg-gray-50`
- `app/budgets/[id]/components/ItemsList.tsx:221` – `bg-white`
- `app/budgets/[id]/components/ItemRow.tsx:246` – Dropdown: `bg-white`
- Modal components – `bg-white dark:bg-gray-800` (OK for modals if card-like)

### Other
- `app/clients/[id]/ClientDetailClient.tsx:121` – Form: `bg-gray-50`
- `components/TopBar.tsx:91` – Edit/Add button: `bg-white` (TopBar is brand-colored; verify)
- `app/notes/components/NoteEditor.tsx:213` – Sticky bar: `bg-slate-50/95`

### Auth pages (explicit light – leave as-is per task)
- LoginForm, SignupForm, ForgotPasswordForm, ResetPasswordClient
- Auth callback modals
- Page wrappers with `from-slate-50 to-slate-100`

## Token mapping
- **bg-background** – App/page background
- **bg-card** / **bg-surface-1** – Main cards, panels
- **bg-surface-2** – Nested panels (e.g. category headers)
- **bg-surface-3** / **bg-accent** – Hover, active states
- **bg-muted** – Subtle fills
- **text-foreground** – Primary text
- **text-muted-foreground** – Secondary/labels
