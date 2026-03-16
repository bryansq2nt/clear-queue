# Project Creation V2 — Conversational Project Intake

This folder holds the **revised** audit and implementation plan for **Project Creation V2**: conversational **intake only** — gather project info in natural language, produce a structured draft, user confirms, system creates the project. No general AI assistant, no milestones/tasks/mind maps.

**Principle:** The system asks the fewest questions needed to create the project. The AI extracts structured information; it does not coach or plan.

**Scope:** Replace the rigid create-project form with a conversational intake flow. FAB opens V2; classic form remains available. No changes to teams/RBAC or to `create_project_atomic`.

---

## Contents

| Document                                                           | Purpose                                                                         |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| [audit-revised.md](./audit-revised.md)                             | **Revised** audit: scope correction, reuse, requirements, risks, non-goals      |
| [implementation-plan-revised.md](./implementation-plan-revised.md) | **Revised** phased plan (Phase 0–4), schema, validation, prompt rules, cut list |
| [contract.md](./contract.md)                                       | API request/response and structured draft contract                              |
| [audit.md](./audit.md)                                             | Original audit (superseded by audit-revised)                                    |
| [implementation-plan.md](./implementation-plan.md)                 | Original plan (superseded by implementation-plan-revised)                       |
