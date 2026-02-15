# Documentación del proyecto

Índice de la documentación técnica, reportes y patrones.

---

## Reportes

| Documento                                                                                   | Descripción                                                                                                                       |
| ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| [Estado de implementación (calidad y enforcement)](reports/IMPLEMENTATION_STATUS_REPORT.md) | Reglas ESLint custom, pre-commit, CI y estado de las violaciones.                                                                 |
| [Reporte de fixes de arquitectura](reports/REPORTE-FIXES-ARQUITECTURA.md)                   | Resumen de los fixes aplicados (no-client-supabase, no-select-star, no-manual-refetch) y cómo se siguieron las reglas y patrones. |
| [Optimización de carga del perfil](reports/REPORTE-OPTIMIZACION-PROFILE.md)                 | Migración del fetch de perfil desde useEffect (cliente) a servidor; cache() y reducción de POSTs; resultado ~3x más rápido.       |

---

## Calidad y reglas

| Documento                                      | Descripción                                                                      |
| ---------------------------------------------- | -------------------------------------------------------------------------------- |
| [Reglas ESLint custom](eslint-rules-README.md) | Definición de las 3 reglas del plugin `clear-queue` y cómo corregir violaciones. |

---

## Patrones de código

| Documento                                        | Descripción                                                         |
| ------------------------------------------------ | ------------------------------------------------------------------- |
| [Server Actions](patterns/server-actions.md)     | Uso de server actions con Supabase, auth y mutaciones.              |
| [Database Queries](patterns/database-queries.md) | Select explícito, scoping y buenas prácticas con Supabase/Postgres. |
| [Transacciones](patterns/transactions.md)        | Patrones para operaciones transaccionales.                          |
| [Data Loading](patterns/data-loading.md)         | Carga de datos en Server Components, cache() y paso por props.      |

---

## Anti-patrones

| Documento                                                                            | Descripción                                                           |
| ------------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| [Client-side data fetching en useEffect](anti-patterns/client-side-data-fetching.md) | ❌ Por qué no cargar datos iniciales en el cliente y cómo corregirlo. |

---

## Audits y análisis

En `audits/`:

| Documento                                                              | Descripción                |
| ---------------------------------------------------------------------- | -------------------------- |
| [Phase 2 – Blast radius](audits/phase2-blast-radius-audit.md)          | Alcance de cambios.        |
| [Phase 3 – Concurrencia](audits/phase3-concurrency-analysis.md)        | Análisis de concurrencia.  |
| [Phase 4 – RLS](audits/phase4-rls-policy-audit.md)                     | Políticas RLS.             |
| [Phase 5 – Schema/código](audits/phase5-schema-code-audit.md)          | Auditoría schema y código. |
| [Phase 6 – Rendimiento](audits/phase6-performance-audit.md)            | Auditoría de rendimiento.  |
| [Phase 7 – Acoplamiento](audits/phase7-coupling-analysis.md)           | Análisis de acoplamiento.  |
| [Codebase findings](audits/codebase-findings-2026-02-13.md)            | Hallazgos del codebase.    |
| [Enterprise technical debt](audits/enterprise-technical-debt-audit.md) | Deuda técnica.             |
| [Milestone feasibility](audits/milestone-feasibility-audit.md)         | Viabilidad de hitos.       |
| [Multi-user signup](audits/multi-user-signup-analysis.md)              | Análisis multi-usuario.    |
| [Miles v1 integration](audits/miles-v1-integration-viability.md)       | Viabilidad de integración. |

---

## Otros

| Documento                                                         | Descripción                       |
| ----------------------------------------------------------------- | --------------------------------- |
| [Idea graph](idea-graph.md)                                       | Funcionalidad del grafo de ideas. |
| [Idea graph – Testing checklist](idea-graph-testing-checklist.md) | Checklist de pruebas.             |
| [Idea graph – Dashboard testing](idea-graph-dashboard-testing.md) | Pruebas del dashboard.            |
| [Theme audit](THEME_AUDIT.md)                                     | Auditoría de temas.               |
| [i18n tone](i18n-tone.md)                                         | Tono y criterios de i18n.         |
| [Ruta recreación UI](RUTA_RECREACION_UI.md)                       | Ruta de recreación de UI.         |

---

En la raíz del repo solo quedan `README.md`, `CONTRIBUTING.md` y `TROUBLESHOOTING.md` como documentos principales.
