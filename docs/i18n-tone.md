# i18n tone and terminology

Brief guide to voice and term consistency for the app’s Spanish (LATAM) and English (US) copy.

---

## Principles

### Spanish (LATAM neutral)

- **Professional but natural**: Avoid corporate jargon and literal translations. Prefer how people actually speak at work in Latin America.
- **Neutral region**: No strong local slang; usable in Mexico, Colombia, Argentina, Chile, etc.
- **Short and clear**: Prefer short sentences. Use "…" only when it adds a natural pause.
- **Consistent terms**: One term per concept across the app (see glossary).

### English (US)

- **Natural and direct**: Sound like a modern product, not a manual. Avoid stiff or robotic phrasing.
- **Sentence case**: Use sentence case for buttons and short labels where it fits (e.g. "Add task", "Save changes").
- **Clear over clever**: Clarity first. No unnecessary words.
- **Same term, same place**: Match the glossary so the same concept always uses the same word.

---

## Glossary

| Concept                  | English (US)        | Spanish (LATAM)           |
| ------------------------ | ------------------- | ------------------------- |
| Main app home            | Dashboard           | Panel                     |
| App configuration        | Settings            | Ajustes                   |
| Task list / board        | Task board          | Tablero de tareas         |
| Tasks not started        | Backlog             | Pendientes                |
| Tasks in progress        | In progress         | En proceso                |
| Tasks stuck              | Blocked             | Detenidas                 |
| Tasks finished           | Done                | Completadas               |
| High-priority tasks      | Critical / Urgent   | Urgentes                  |
| Money value              | Amount              | Importe                   |
| Invoicing / charges      | Billings            | Facturación               |
| No items yet             | No … yet.           | Aún no hay …              |
| Optional field           | (optional)          | (opcional)                |
| Save action              | Save / Save changes | Guardar / Guardar cambios |
| Remove from list         | Remove              | Quitar                    |
| Project status: archived | Archived            | Archivado                 |
| Project status: healthy  | Healthy             | Saludable                 |
| Project status: warning  | Warning             | Advertencia               |
| Project status: critical | Critical            | Crítico                   |

---

## Decisions

- **"Blocked" → "Detenidas" (ES)**: We use "Detenidas" for tasks that are stuck, to avoid the heavier "Bloqueadas" and keep a neutral, professional tone.
- **"Done" → "Completadas" (ES)**: One word for "finished tasks" everywhere (kanban, dashboard, filters) to avoid mixing "Terminado" and "Completadas".
- **"Critical" → "Urgentes" (ES)**: "Urgentes" is clearer for users than "Prioridad crítica" or "Crítico" in task contexts.
- **"Amount" → "Importe" (ES)**: "Importe" is the preferred term in LATAM for money amounts in bills and forms.
- **"Settings" → "Ajustes" (ES)**: Used in nav and settings page title for a short, familiar label.
- **Sentence case (EN)**: Buttons and short UI labels use sentence case (e.g. "Add task", "Create project") for a modern, product-like feel.
- **Placeholders unchanged**: All `{count}`, `{days}`, `{name}`, etc. are kept as-is; only the surrounding text was adjusted for tone.
- **No new keys**: Only the string values were changed; key names and structure are unchanged for compatibility.
