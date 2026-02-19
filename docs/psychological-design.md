# Psychological Design: Subtle Guidance for Focus and Clarity

This document captures the product philosophy of **helping users think clearly and stay focused** through subtle, indirect UI and copy—without feeling lectured or managed. The goal is to support intent and reduce cognitive load so users keep working effectively on their projects.

---

## 1. Core idea

- **We help users clarify their thinking** by framing the next step as a question or a gentle nudge, not as a command or a generic greeting.
- **The help is subliminal / indirect**: the system doesn’t say “you should focus” or “remember your goals.” It simply structures the moment (e.g. a question in the header, ordering, or a single clear action) so that focus and intent emerge naturally.
- **The product’s job** is to keep people in flow on their projects; every screen and transition can reinforce that.

Use this doc when adding or changing features so new modules and entry points stay aligned with this approach.

---

## 2. Principles

### 2.1 Match the message to the moment

- **First entry** (e.g. just logged in): a short welcome is appropriate (“Welcome back, {name}”).
- **Returning from deep work** (e.g. “Volver al inicio” from a project): a welcome can feel wrong. Prefer a **question that reflects the current decision**: e.g. “¿Quieres trabajar en algo diferente?” / “Want to work on something different?” This:
  - Acknowledges they’re already in the system.
  - Frames the screen as “choose what to work on next,” not “hello again.”
  - Reduces the sense of “starting over” and supports switching context intentionally.

**Rule of thumb:** If the user just came from a specific context (project, list, etc.), the next screen’s main line should support the decision they’re about to make, not repeat a generic greeting.

### 2.2 Prefer questions over statements

- Questions invite a small mental step (“what do I want to do?”) instead of a passive read.
- Examples:
  - “Want to work on something different?” → clarifies intent when choosing a project.
  - “What’s the next step?” (e.g. in a task or project view) → can be used in other modules.
- Use sparingly and only where the next action is clearly “answer by doing something on this screen.”

### 2.3 Reduce unnecessary friction and noise

- Avoid copy or UI that doesn’t help the current decision (e.g. long explanations on a picker, repeated greetings).
- Order and highlight things that reflect **recent or relevant use** (e.g. “recently opened” projects first, with a subtle visual cue) so the user doesn’t have to search or remember.

### 2.4 One clear “job” per screen

- Each main view should have one primary job (e.g. “pick a project,” “see this project’s board,” “choose the next task”).
- Headers and main copy should state or imply that job. When the user returns from a sub-context, the header can reframe that job as a question (see 2.1).

---

## 3. Applied example: project picker (home)

| Moment                         | Before (weaker)              | After (aligned)                                      |
|--------------------------------|------------------------------|------------------------------------------------------|
| User opens app (first time)    | —                            | “Welcome back, {name}”                              |
| User clicks “Volver al inicio”  | “Welcome back, {name}”       | “¿Quieres trabajar en algo diferente, {name}?”      |

Implementation detail: we distinguish “returning from a project” via a query param (`?from=project`) and show the question only in that case, so the same home screen serves both “first entry” and “returning from work” without extra screens.

---

## 4. How to use this in other modules

When designing or reviewing a feature, ask:

1. **What is the user’s current moment?** (e.g. first visit, returning from X, mid-task, after completing something.)
2. **What is the one decision or action we want to support here?** (e.g. pick project, choose next task, close the day.)
3. **Does the main title/copy match that moment and decision?** If they’re coming from somewhere specific, prefer a short question or framing that reflects the next step instead of a generic greeting or label.
4. **Can we reduce noise?** Remove or shorten copy that doesn’t help the current decision.
5. **Can we use order or subtle cues (e.g. “recent”) to support focus?** Without telling the user to “focus,” we can surface what’s most relevant (recent projects, current sprint, etc.).

Ideas for future application:

- **After completing a task:** e.g. “¿Siguiente tarea?” / “Next task?” instead of a generic “Done.”
- **End of day or “wrap up” view:** e.g. “¿Algo más antes de cerrar?” / “Anything else before you finish?”
- **Empty states:** short question that invites the next action (e.g. “¿Crear el primer proyecto?”) instead of only “No projects yet.”
- **Switching context (e.g. from Ideas to Board):** one-line question that frames the tab (e.g. “¿Qué quieres hacer en el tablero?”) where it adds value.

---

## 5. Summary

- **Philosophy:** Help users think and stay focused in a subtle, indirect way.
- **Mechanisms:** Match message to moment, prefer questions for decisions, reduce noise, one clear job per screen, use “recent”/relevance to guide attention.
- **Reference implementation:** Home project picker with “Welcome back” on first entry and “¿Quieres trabajar en algo diferente?” when returning from a project.

Use this document when adding or changing flows so new features keep the same psychological design: supporting focus and clarity without feeling heavy or prescriptive.
