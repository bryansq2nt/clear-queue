# Documentación del proyecto

Índice de la documentación técnica, reportes, planes y patrones.  
La documentación está organizada por categorías bajo `docs/`.

---

## Estructura de carpetas

| Carpeta                              | Contenido                                                                                                |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| [audits/](audits/)                   | Auditorías técnicas, deuda, rendimiento, tema, resúmenes (AUDIT_SUMMARY, phases, THEME_AUDIT, etc.)      |
| [reports/](reports/)                 | Reportes de estado, fixes, optimización, implementación, comparativas, auditoría de docs                 |
| [plans/](plans/)                     | Planes de implementación, fases, rutas de UI (plan-\*, RUTA_RECREACION_UI, IMPLEMENTATION_PLAN)          |
| [troubleshooting/](troubleshooting/) | Log de problemas y soluciones durante el desarrollo                                                      |
| [research/](research/)               | Diseño, investigación, criterios (navegación por contexto, idea-graph, i18n, psychological-design)       |
| [testing/](testing/)                 | Checklists y guías de pruebas (idea-graph)                                                               |
| [reference/](reference/)             | Reglas ESLint, guías de usuario                                                                          |
| [patterns/](patterns/)               | Patrones de código (server-actions, database-queries, data-loading, transactions, context-session-cache) |
| [anti-patterns/](anti-patterns/)     | Anti-patrones y cómo evitarlos                                                                           |

---

## Reportes

| Documento                                                                   | Descripción                                                               |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| [Estado de implementación](reports/IMPLEMENTATION_STATUS_REPORT.md)         | Reglas ESLint custom, pre-commit, CI y estado de violaciones.             |
| [Reporte de fixes de arquitectura](reports/REPORTE-FIXES-ARQUITECTURA.md)   | Resumen de fixes (no-client-supabase, no-select-star, no-manual-refetch). |
| [Optimización de carga del perfil](reports/REPORTE-OPTIMIZACION-PROFILE.md) | Migración del fetch de perfil a servidor; cache() y reducción de POSTs.   |
| [Auditoría y reorganización de docs](reports/DOCS_AUDIT_AND_RESTRUCTURE.md) | Criterios y resultado de la reorganización de documentación.              |

---

## Planes

| Documento                                                                                 | Descripción                                                          |
| ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| [Plan de implementación (fases)](plans/IMPLEMENTATION_PLAN.md)                            | Estrategia por fases a partir de AUDIT_SUMMARY.                      |
| [Ruta recreación UI](plans/RUTA_RECREACION_UI.md)                                         | Ruta de recreación de UI (Fases B–F).                                |
| [Plan Kanban optimista sin refresh](plans/plan-kanban-optimistic-no-refresh.md)           | Optimistic UI y manejo de errores en el board de contexto.           |
| [Plan navegación instantánea y skeletons](plans/plan-instant-navigation-and-skeletons.md) | Navegación y skeletons.                                              |
| [Plan fase 3 cache fix](plans/plan-fase3-cache-fix.md)                                    | Fix del cache de sesión por contexto.                                |
| [Plan owner / client / business](plans/plan-owner-add-client-business.md)                 | Añadir responsable y cliente/negocio al proyecto.                    |
| [Plan contexto de errores en Sentry](plans/plan-sentry-error-context.md)                  | Diseño y plan: módulo, intención, esperado y sucedido en cada error. |
| [Plan Media Vault implementación](plans/plan-media-vault-implementation.md)               | Fases 1–4: DB, acciones, UI y polish del módulo Media.               |
| [Plan Media Canvas UX](plans/plan-media-canvas-ux.md)                                     | Layout full-bleed, menú de acciones, share, download, zoom/pan.      |

---

## Referencia y calidad

| Documento                                                       | Descripción                                                                    |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| [Reglas ESLint custom](reference/eslint-rules-README.md)        | Definición de las reglas del plugin `clear-queue` y cómo corregir violaciones. |
| [Guía de usuario y tips](reference/plan-user-guide-and-tips.md) | Guía y recomendaciones de uso.                                                 |
| [Guía de Sentry](reference/sentry-guide.md)                     | Qué es Sentry, para qué sirve y cómo usarlo (errores, rendimiento, Replay).    |

---

## Patrones de código

| Documento                                                  | Descripción                                                         |
| ---------------------------------------------------------- | ------------------------------------------------------------------- |
| [Server Actions](patterns/server-actions.md)               | Uso de server actions con Supabase, auth y mutaciones.              |
| [Database Queries](patterns/database-queries.md)           | Select explícito, scoping y buenas prácticas con Supabase/Postgres. |
| [Transacciones](patterns/transactions.md)                  | Patrones para operaciones transaccionales.                          |
| [Data Loading](patterns/data-loading.md)                   | Carga de datos en Server Components, cache() y paso por props.      |
| [Context Session Cache](patterns/context-session-cache.md) | Cache de sesión por contexto (no refetch al volver).                |

---

## Anti-patrones

| Documento                                                                            | Descripción                                                        |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| [Client-side data fetching en useEffect](anti-patterns/client-side-data-fetching.md) | Por qué no cargar datos iniciales en el cliente y cómo corregirlo. |

---

## Audits y análisis

En [audits/](audits/): Phase 2–7, enterprise technical debt, milestone feasibility, multi-user signup, Miles v1, THEME_AUDIT, AUDIT_SUMMARY, PERFORMANCE_AUDIT, PROFILE_USEEFFECT_AUDIT, codebase findings, etc.

---

## Research y diseño

| Documento                                                                  | Descripción                          |
| -------------------------------------------------------------------------- | ------------------------------------ |
| [Diseño de navegación por contexto](research/context-navigation-design.md) | Rutas y UX del modo contexto.        |
| [Diseño psicológico](research/psychological-design.md)                     | Criterios de diseño y tono.          |
| [Idea graph](research/idea-graph.md)                                       | Funcionalidad del grafo de ideas.    |
| [Tono i18n](research/i18n-tone.md)                                         | Criterios de tono para traducciones. |

---

## Testing

| Documento                                                                 | Descripción                              |
| ------------------------------------------------------------------------- | ---------------------------------------- |
| [Idea graph – Testing checklist](testing/idea-graph-testing-checklist.md) | Checklist de pruebas del grafo de ideas. |
| [Idea graph – Dashboard testing](testing/idea-graph-dashboard-testing.md) | Pruebas del dashboard de ideas.          |

---

## Troubleshooting

| Documento                                                 | Descripción                                                |
| --------------------------------------------------------- | ---------------------------------------------------------- |
| [Troubleshooting log](troubleshooting/TROUBLESHOOTING.md) | Problemas encontrados durante desarrollo y sus soluciones. |

---

En la raíz del repo quedan **README.md** y **CONTRIBUTING.md** como documentos principales del proyecto.
