# Handoff prompt: Ejecutar plan (Facturación + Copilot)

**Copia y pega el bloque siguiente en una nueva sesión de Claude Code (o Cursor) para que implemente todo el plan.**

---

## Prompt para Claude (copiar desde aquí)

```
You are continuing work on the ClearQueue project (Next.js, Supabase, TypeScript). Your task is to implement the full plan described in the repo. Execute in two phases, in this order.

## Repo rules (mandatory)

- Read and follow: .cursorrules, AGENTS.md, CONVENTIONS.md (repo root). Read docs/patterns/ as needed for server-actions, database-queries, data-loading, context-session-cache.
- Server actions: 'use server', requireAuth() first, revalidatePath after mutations. No createClient() from @/lib/supabase/client in components or *Client.tsx.
- i18n: all new UI strings in locales/en.json and locales/es.json (under appropriate keys, e.g. copilot.* for Copilot, billing.* for Facturación).
- After edits: npx prettier --write on changed files; fix lint errors.

## Plan to execute (single source of truth)

Read and follow the full plan in this file — it contains all task details, implementation notes, and file references:

**docs/project-copilot/plans/HANDOFF_PROMPT_COPILOT_SIX_TASKS.md**

Do not skip sections. Execute in the order specified there.

## Execution order (summary)

**Phase 1 — Módulo Facturación (do these first)**
1. **Tarea Facturación 1** — Fix error "Could not embed because more than one relationship was found for 'billings' and 'clients'". Table billings has two FKs to clients: client_id and reimburse_to_client_id. Disambiguate in every query that embeds/expands clients (use the FK hint for the relationship you need, e.g. client_id → clients). See the plan for migrations and details.
2. **Tarea Facturación 2** — In "Nuevo Cargo" form, default client dropdown to the project's linked client, or "Personalizado / Sin cliente" if none.
3. **Tarea Facturación 3** — Validate: due date cannot be less than issue date (front and optionally backend).
4. **Tarea Facturación 4** — In the form, show "Fecha de emisión" before "Vence" (due date).
5. **Tarea Facturación 5** — Replace date text inputs with a date picker (mini calendar) for issue and due date.

**Phase 2 — Copilot (after Facturación)**
6. **Tarea Copilot 1** — Bulk Approve/Reject: when one bulk action runs, the other button becomes "Stop" to cancel; fix button states.
7. **Tarea Copilot 2** — Delete proposals: when approved, show "Eliminado" and "Deshacer", not "Creado — ver en...".
8. **Tarea Copilot 3** — Order: create milestones before tasks when approving (client sort + prompt).
9. **Tareas Copilot 4, 5, 6** — Full Copilot access to Budgets, Clients, Facturación (context + proposal types + approve flow + UI).
10. **Tarea Copilot 7** — Large proposals: avoid truncation (max_tokens and/or prompt to limit proposals per message and offer batches).
11. **Tarea Copilot 8** — Status messages during stream: reflect real phase (Reading…, Reasoning…, Creating note…, Generating tasks…, etc.) using stream buffer to detect proposal type.

## What to do

1. Open and read **docs/project-copilot/plans/HANDOFF_PROMPT_COPILOT_SIX_TASKS.md** in full.
2. Implement Phase 1 (Facturación 1–5) first.
3. Then implement Phase 2 (Copilot 1–8).
4. Run npm run lint, npm run build, and fix any errors.
5. At the end, summarize what was done, files changed, and how to test.
```

---

## Uso

1. Abre una nueva conversación con Claude Code (o Cursor).
2. Copia **todo** el contenido entre las líneas que empiezan con ``` (incluidas las tres backticks de cierre).
3. Pega en el chat y envía.
4. Claude leerá el plan en `HANDOFF_PROMPT_COPILOT_SIX_TASKS.md` y ejecutará primero las 5 tareas de Facturación y después las 8 del Copilot.
