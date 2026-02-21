# Auditoría y reorganización de documentación

**Fecha:** 2026-02-21  
**Objetivo:** Mover documentación del root a `docs/` y organizar por categorías.

---

## Estado inicial

### En la raíz del proyecto (fuera de docs)

| Archivo                    | Tipo            | Acción                            |
| -------------------------- | --------------- | --------------------------------- |
| README.md                  | Proyecto        | **Mantener en root** (convención) |
| CONTRIBUTING.md            | Proyecto        | **Mantener en root** (convención) |
| AUDIT_SUMMARY.md           | Auditoría       | → docs/audits/                    |
| IMPLEMENTATION_PLAN.md     | Plan            | → docs/plans/                     |
| PERFORMANCE_AUDIT.md       | Auditoría       | → docs/audits/                    |
| PROFILE_USEEFFECT_AUDIT.md | Auditoría       | → docs/audits/                    |
| TROUBLESHOOTING.md         | Troubleshooting | → docs/troubleshooting/           |

### En docs/ (sin subcarpeta o a reubicar)

| Archivo                                  | Categoría propuesta |
| ---------------------------------------- | ------------------- |
| RUTA_RECREACION_UI.md                    | plans               |
| plan-kanban-optimistic-no-refresh.md     | plans               |
| plan-owner-add-client-business.md        | plans               |
| plan-instant-navigation-and-skeletons.md | plans               |
| plan-fase3-cache-fix.md                  | plans               |
| plan-user-guide-and-tips.md              | reference           |
| context-navigation-design.md             | research            |
| psychological-design.md                  | research            |
| idea-graph.md                            | research            |
| i18n-tone.md                             | research            |
| idea-graph-testing-checklist.md          | testing             |
| idea-graph-dashboard-testing.md          | testing             |
| eslint-rules-README.md                   | reference           |
| THEME_AUDIT.md                           | audits              |

### Estructura ya existente en docs/

- **audits/** — varias auditorías (phases, enterprise, etc.)
- **reports/** — reportes de avance, implementación, comparativas
- **patterns/** — server-actions, database-queries, data-loading, etc.
- **anti-patterns/** — client-side-data-fetching

---

## Categorías definidas

| Carpeta             | Contenido                                                                                                                           |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **audits**          | Auditorías técnicas, resúmenes de deuda, análisis (phase\*, THEME_AUDIT, AUDIT_SUMMARY, PERFORMANCE_AUDIT, PROFILE_USEEFFECT_AUDIT) |
| **reports**         | Reportes de estado, fixes, optimización, implementación, comparativas                                                               |
| **plans**           | Planes de implementación, fases, rutas de UI (plan-\*, RUTA_RECREACION_UI, IMPLEMENTATION_PLAN)                                     |
| **troubleshooting** | Log de problemas y soluciones durante desarrollo                                                                                    |
| **research**        | Diseño, investigación, criterios (context-navigation, psychological-design, idea-graph, i18n-tone)                                  |
| **testing**         | Checklists y guías de pruebas (idea-graph-testing-\*)                                                                               |
| **reference**       | Referencia de reglas y guías (eslint-rules, user-guide-and-tips)                                                                    |
| **patterns**        | Patrones de código (server-actions, database-queries, data-loading, transactions, context-session-cache)                            |
| **anti-patterns**   | Anti-patrones y cómo evitarlos                                                                                                      |

---

## Estructura final objetivo

```
docs/
├── README.md                 # Índice de documentación
├── audits/
│   ├── (existentes)
│   ├── AUDIT_SUMMARY.md      # desde root
│   ├── PERFORMANCE_AUDIT.md  # desde root
│   ├── PROFILE_USEEFFECT_AUDIT.md  # desde root
│   └── THEME_AUDIT.md        # desde docs root
├── reports/
│   ├── (existentes)
│   └── DOCS_AUDIT_AND_RESTRUCTURE.md
├── plans/
│   ├── IMPLEMENTATION_PLAN.md        # desde root
│   ├── RUTA_RECREACION_UI.md
│   ├── plan-kanban-optimistic-no-refresh.md
│   ├── plan-owner-add-client-business.md
│   ├── plan-instant-navigation-and-skeletons.md
│   └── plan-fase3-cache-fix.md
├── troubleshooting/
│   └── TROUBLESHOOTING.md    # desde root
├── research/
│   ├── context-navigation-design.md
│   ├── psychological-design.md
│   ├── idea-graph.md
│   └── i18n-tone.md
├── testing/
│   ├── idea-graph-testing-checklist.md
│   └── idea-graph-dashboard-testing.md
├── reference/
│   ├── eslint-rules-README.md
│   └── plan-user-guide-and-tips.md
├── patterns/
│   └── (sin cambios)
└── anti-patterns/
    └── (sin cambios)
```

---

Reorganización aplicada según este documento.
