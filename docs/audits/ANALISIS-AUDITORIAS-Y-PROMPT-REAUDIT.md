# Análisis de las auditorías Codex y prompt para re-auditoría

**Fecha:** 2025-02-15  
**Objetivo:** Resumir los hallazgos originales en `docs/audits`, vincularlos con el trabajo de remediación realizado, y proporcionar un prompt para que Codex vuelva a ejecutar los análisis y mida el avance.

---

## 1. Resumen de los archivos en `docs/audits`

### 1.1 Documentos de hallazgos priorizados

| Archivo                                | Contenido principal                                                                                                                                                            |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **codebase-findings-2026-02-13.md**    | Lista priorizada de hallazgos por ID (SEC-001 a SEC-004, PERF-001 a PERF-003, VIBE-001/002, MAINT-001, INFO-001). Incluye severidad, ubicación, evidencia y riesgo.            |
| **enterprise-technical-debt-audit.md** | Fase 1: matriz de rutas de lectura (client vs server) y de escritura + estrategia de refresh. Hallazgos CRÍTICOS: lecturas mixtas en projects/tasks y doble-refresh sistémico. |

### 1.2 Fases de análisis (Phase 2–7)

| Archivo                            | Enfoque                                                                                                                                                                 |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **phase2-blast-radius-audit.md**   | Radio de explosión y cascadas: condiciones de carrera por acción (updateProject, archiveProject, createTask, updateTaskOrder, etc.), doble-refresh, prioridad P0/P1/P2. |
| **phase3-concurrency-analysis.md** | Transacciones: operaciones multi-paso sin transacción (updateBusinessFieldsAction, updateTaskOrder), falta de rollback, alternativas atómicas (RPC).                    |
| **phase4-rls-policy-audit.md**     | RLS: inventario de tablas, políticas SELECT/INSERT/UPDATE/DELETE, huecos (WITH CHECK en UPDATE, triggers de integridad).                                                |
| **phase5-schema-code-audit.md**    | Alineación esquema DB vs tipos TypeScript, uso de `SELECT *` y columnas explícitas en código.                                                                           |
| **phase6-performance-audit.md**    | Anti-patrones de rendimiento: N+1 (todo summary, updateTaskOrder por fila, duplicación de categorías en budgets), SELECT \*, fetches duplicados sin cache.              |
| **phase7-coupling-analysis.md**    | Acoplamiento: grafo de dependencias, dependencias circulares, hubs (I18nProvider, app/clients/actions, Sidebar), inventario de imports por módulo.                      |

### 1.3 Análisis de contexto y viabilidad

| Archivo                               | Enfoque                                                                                        |
| ------------------------------------- | ---------------------------------------------------------------------------------------------- |
| **milestone-feasibility-audit.md**    | Inventario de datos existentes para hitos y capacidad.                                         |
| **miles-v1-integration-viability.md** | Viabilidad de integrar Miles v1: realidad de módulos (lecturas en cliente, patrón de refresh). |
| **multi-user-signup-analysis.md**     | Auth actual (admin-only), ownership/RLS por área, cambios mínimos para multi-usuario.          |

---

## 2. Trabajo de remediación realizado (contexto para la re-auditoría)

Tras los hallazgos, se aplicó:

1. **Arquitectura de datos (data-loading):**
   - Lecturas concentradas en servidor: Server Components async hacen `await get*()` en `page.tsx` y pasan datos al cliente como props.
   - Acciones de solo lectura envueltas en `cache()` de React para deduplicar en el mismo request.
   - Clientes sin fetch inicial en `useEffect`: reciben `initial*` y usan `useState(initial*)`; los `load*` se mantienen solo para refetch tras mutaciones.

2. **Reglas y patrones:**
   - No Supabase en componentes cliente (solo server actions o API).
   - No `SELECT *`; columnas explícitas en queries.
   - No refetch manual redundante tras mutación; uso de `router.refresh()` o datos devueltos por la acción donde aplica.

3. **Páginas/rutas optimizadas con el patrón anterior:**
   - Dashboard, Projects, Clients, Businesses, Billings, Budgets, Ideas, Notes, Todo, Settings/appearance, Profile, Project/[id].
   - Layout raíz: `getProfileOptional()` y `getPreferencesOptional()` en servidor; I18nProvider y ThemeProvider reciben datos iniciales (sin llamadas a getProfile/getPreferences en mount).

4. **Documentación de referencia:**
   - `docs/patterns/data-loading.md`, `docs/patterns/server-actions.md`, `docs/patterns/database-queries.md`.
   - Reportes en `docs/reports/`: REPORTE-FIXES-ARQUITECTURA, REPORTE-OPTIMIZACION-PROFILE, REPORTE-COMPARATIVA-LOGS-PERFORMANCE.
   - `PERFORMANCE_AUDIT.md` con estado por ruta (POSTs, Fixed/Pending).

Lo que **no** se ha abordado (o solo parcialmente) en esta tanda:

- Correcciones en migraciones RLS (SEC-001, SEC-002, SEC-003): WITH CHECK en UPDATE, trigger de proyecto-cliente-business.
- Transacciones / RPC atómicos para updateTaskOrder y updateBusinessFieldsAction.
- Eliminación de N+1 en `getProjectsWithTodoSummaryAction` y en bucles de update por fila en tasks/budgets.
- Endurecimiento de validaciones en server actions (VIBE-002), mensajes de error de auth (SEC-004), manejo de errores (MAINT-001).

---

## 3. Prompt para que Codex re-ejecute los análisis y mida el avance

A continuación se incluye un prompt que puedes dar a Codex (o a un agente que actúe como auditor) para que vuelva a ejecutar las mismas categorías de análisis, compare con los hallazgos originales y produzca un informe de avance.

---

```markdown
# Tarea: Re-auditoría del codebase y informe de avance

## Contexto

Este repositorio fue auditado anteriormente por Codex. Los hallazgos se documentaron en la carpeta `docs/audits/` en los siguientes archivos:

- **Hallazgos priorizados:** `codebase-findings-2026-02-13.md`
- **Deuda técnica (flujo de datos y refresh):** `enterprise-technical-debt-audit.md`
- **Fases 2–7:** `phase2-blast-radius-audit.md`, `phase3-concurrency-analysis.md`, `phase4-rls-policy-audit.md`, `phase5-schema-code-audit.md`, `phase6-performance-audit.md`, `phase7-coupling-analysis.md`
- **Contexto:** `milestone-feasibility-audit.md`, `miles-v1-integration-viability.md`, `multi-user-signup-analysis.md`

Desde entonces, el equipo aplicó remediaciones enfocadas en:

1. **Arquitectura de datos:** patrón server-side data loading (server fetch + `cache()` + props al cliente, sin fetch en `useEffect` al montar). Ver `docs/patterns/data-loading.md`.
2. **Reglas de código:** sin Supabase en componentes cliente; columnas explícitas (no `SELECT *`); reducción de refetch manual redundante.
3. **Optimización de rutas:** Dashboard, Projects, Clients, Businesses, Billings, Budgets, Ideas, Notes, Todo, Settings/appearance, Profile, Project/[id] cargan datos en el servidor y pasan props iniciales al cliente.

## Tu misión

1. **Leer los documentos de auditoría originales** en `docs/audits/` (listados arriba) para recordar los hallazgos, ubicaciones y criterios usados.

2. **Re-ejecutar los mismos tipos de análisis** sobre el código actual del repositorio:
   - **Lecturas de datos:** ¿Sigue existiendo uso de Supabase o de server actions de lectura desde componentes cliente en mount (useEffect) para las mismas rutas/dominios que antes? ¿O las lecturas están en Server Components y se pasan por props?
   - **Refresh post-mutación:** En las acciones y en los clientes que llaman a esas acciones, ¿sigue el patrón doble (revalidatePath + manual load/refetch) o se ha unificado (solo revalidatePath, o solo refetch, o datos devueltos por la acción)?
   - **SELECT \* / columnas:** ¿Quedan usos de `.select('*')` o equivalentes en `app/`, `lib/` y migraciones referenciadas desde código?
   - **N+1 y bucles de escritura:** Revisar `app/todo/actions.ts` (getProjectsWithTodoSummaryAction), `app/actions/tasks.ts` (updateTaskOrder), `app/budgets/actions.ts` (duplicación de categorías). ¿Siguen los mismos patrones N+1 o por-fila?
   - **Transacciones / multi-paso:** updateBusinessFieldsAction, updateTaskOrder: ¿siguen sin transacción/RPC atómico?
   - **RLS y migraciones:** Políticas UPDATE sin WITH CHECK (SEC-001, SEC-002), trigger de proyecto-cliente-business (SEC-003). ¿Siguen igual en `supabase/migrations/`?
   - **Acoplamiento:** Componentes que importan `lib/supabase/client` o que llaman a muchas server actions de lectura en mount; hubs (I18nProvider, Sidebar, clients/actions). ¿Ha cambiado el grafo o los puntos de acoplamiento?

3. **Comparar con los hallazgos originales** y clasificar cada ítem relevante como:
   - **RESUELTO:** La evidencia ya no existe o el patrón fue reemplazado por el recomendado.
   - **PARCIALMENTE RESUELTO:** Mejorado pero no al 100% (ej. menos POSTs pero aún hay algún refetch redundante).
   - **SIN CAMBIOS:** Sigue igual que en el informe original.
   - **NUEVO:** Un problema que no estaba en los informes originales (opcional).

4. **Generar un informe de avance** con la siguiente estructura y guardarlo en `docs/reports/REPORTE-AVANCE-AUDITORIA-CODEX.md`:
   - **Resumen ejecutivo:** número/porcentaje de hallazgos resueltos, parcialmente resueltos y sin cambios por categoría (Security, Performance, Data flow, RLS, Coupling, etc.).
   - **Tabla o secciones por documento de origen** (codebase-findings, enterprise-technical-debt, phase2–7): para cada hallazgo o grupo de hallazgos, indicar estado (RESUELTO / PARCIAL / SIN CAMBIOS) y evidencia breve (archivo/línea o descripción).
   - **Métricas opcionales:** Por ejemplo: “Rutas con data-loading server-side: X de Y”; “Componentes que ya no usan createClient() de Supabase en cliente: …”; “Acciones que siguen con doble-refresh: …”.
   - **Recomendaciones siguientes:** Priorizar los ítems que sigan SIN CAMBIOS o PARCIALMENTE RESUELTOS según impacto y esfuerzo.

5. **Citar archivos y líneas** cuando indiques que algo está resuelto o sin cambios, para que el equipo pueda verificar.

No inventes hallazgos; limítate a lo que los documentos originales y el código actual permitan constatar. Si un archivo o línea ya no existe, indícalo como “código movido/eliminado” y busca el equivalente actual si aplica.
```

---

## 4. Uso del prompt

- Puedes pegar el bloque del prompt (desde `# Tarea: Re-auditoría...` hasta el final) en Codex o en un agente que tenga acceso al repo y a `docs/audits/`.
- Asegúrate de que el agente pueda leer la carpeta `docs/audits/` y los archivos de código referenciados en los informes originales.
- El resultado esperado es `docs/reports/REPORTE-AVANCE-AUDITORIA-CODEX.md`, que podrás usar para comunicar el avance y priorizar el siguiente trabajo (RLS, transacciones, N+1, etc.).
