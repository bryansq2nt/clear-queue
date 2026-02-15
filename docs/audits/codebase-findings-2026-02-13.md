# Auditoría de código (solo identificación)

## 1. Resumen Ejecutivo

### Conteo por severidad

- **Critical:** 0
- **High:** 3
- **Medium:** 4
- **Low:** 3
- **Info:** 1

### Top 5 hallazgos por riesgo

1. **SEC-001 (High):** Políticas RLS `FOR UPDATE` sin `WITH CHECK` en `budget_categories` y `budget_items`, permitiendo reasignaciones de filas a recursos fuera del tenant si se conoce un UUID válido.
2. **SEC-002 (High):** Política RLS `FOR UPDATE` sin `WITH CHECK` en `business_media`, con mismo patrón de reasignación potencial cruzada.
3. **SEC-003 (High):** Trigger de integridad en `projects` no valida pertenencia (`owner_id`) de `client_id`/`business_id`, permitiendo referencias cruzadas entre tenants.
4. **PERF-001 (Medium):** Reordenamiento de tareas con múltiples updates secuenciales por fila (`N` queries) y sin transacción explícita.
5. **PERF-002 (Medium):** Resumen de TODO por proyecto con patrón N+1 (`getTodoItemsByListIds` por cada proyecto).

---

## 2. Tabla de Hallazgos (lista priorizada)

### SEC-001

- **ID:** SEC-001
- **Severidad:** High
- **Categoría:** Security
- **Título corto:** RLS de actualización sin `WITH CHECK` en categorías/items de presupuesto
- **Ubicación:** `supabase/migrations/20260208120000_multi_user_projects_tasks_budgets.sql` (políticas `Users can update categories in own budgets` y `Users can update items in own budgets`)
- **Evidencia:** Las políticas `FOR UPDATE` de `budget_categories` y `budget_items` definen `USING (...)` pero no incluyen `WITH CHECK (...)` para validar el estado post-update.
- **Riesgo/Impacto:** Un usuario con permiso de update sobre su fila actual puede cambiar FK (`budget_id`/`category_id`) y mover datos a otra entidad, rompiendo aislamiento de tenant si conoce IDs válidos.
- **Condición de explotación / escenario:** Ocurre cuando un atacante autenticado logra/obtiene un UUID de presupuesto o categoría de otro tenant.
- **Notas:** Patrón similar al de `business_media` (SEC-002).

### SEC-002

- **ID:** SEC-002
- **Severidad:** High
- **Categoría:** Security
- **Título corto:** RLS de actualización sin `WITH CHECK` en `business_media`
- **Ubicación:** `supabase/migrations/20260208140000_clients_and_businesses.sql` (policy `Users can update media in own businesses`)
- **Evidencia:** La policy `FOR UPDATE` usa `USING (...)` sobre la fila actual pero no `WITH CHECK (...)` para validar `business_id` después de la actualización.
- **Riesgo/Impacto:** Posible reasignación de media a `business_id` ajeno (si existe/UUID conocido), con contaminación de datos entre tenants.
- **Condición de explotación / escenario:** Usuario autenticado con update sobre media propia y conocimiento de `business_id` externo.
- **Notas:** Mismo anti-patrón de RLS que SEC-001.

### SEC-003

- **ID:** SEC-003
- **Severidad:** High
- **Categoría:** Security
- **Título corto:** Integridad de proyecto-cliente-business sin validación de `owner_id`
- **Ubicación:** `supabase/migrations/20260208140000_clients_and_businesses.sql` (`check_project_client_business`)
- **Evidencia:** El trigger solo valida que `business_id` pertenezca al `client_id`; no valida que `client_id`/`business_id` pertenezcan al mismo `owner_id` del proyecto.
- **Riesgo/Impacto:** Referencias cruzadas entre tenants en `projects`, creando vínculos indebidos a entidades de otros usuarios.
- **Condición de explotación / escenario:** Usuario autenticado actualizando/insertando `projects` con UUIDs de `clients`/`businesses` ajenos.
- **Notas:** Relacionado con controles de autorización a nivel de datos, no de autenticación.

### PERF-001

- **ID:** PERF-001
- **Severidad:** Medium
- **Categoría:** Performance
- **Título corto:** Reordenamiento de tareas con múltiples updates secuenciales
- **Ubicación:** `app/actions/tasks.ts` (`updateTaskOrder`)
- **Evidencia:** Se iteran columnas de tareas y se ejecuta `update` fila por fila dentro de bucles para ajustar `order_index`.
- **Riesgo/Impacto:** Latencia creciente con volumen; mayor probabilidad de estados intermedios inconsistentes bajo concurrencia.
- **Condición de explotación / escenario:** Tableros con muchas tareas o múltiples usuarios moviendo tarjetas simultáneamente.
- **Notas:** También incrementa carga de DB por operación de drag-and-drop.

### PERF-002

- **ID:** PERF-002
- **Severidad:** Medium
- **Categoría:** Performance
- **Título corto:** Patrón N+1 al construir resumen de TODO por proyecto
- **Ubicación:** `app/todo/actions.ts` (`getProjectsWithTodoSummaryAction`)
- **Evidencia:** Por cada proyecto se invoca `getTodoItemsByListIds(listIds)` en un `for`.
- **Riesgo/Impacto:** Escalado pobre en cantidad de proyectos/listas; tiempo de respuesta y costo de consultas aumentan linealmente.
- **Condición de explotación / escenario:** Usuarios con muchos proyectos activos.
- **Notas:** Hallazgo de optimización, no de autorización.

### VIBE-001

- **ID:** VIBE-001
- **Severidad:** Medium
- **Categoría:** Vibe
- **Título corto:** Uso extendido de `any` y `@ts-ignore` en operaciones críticas
- **Ubicación:** `app/actions/tasks.ts`, `app/budgets/[id]/actions.ts`, `lib/projects.ts`, `lib/idea-graph/*`
- **Evidencia:** Casts a `any` en updates/inserts y directivas `@ts-ignore` para omitir chequeos de tipos en acceso/transformación de datos.
- **Riesgo/Impacto:** Reducción de garantías estáticas; mayor probabilidad de errores de runtime y validaciones incompletas.
- **Condición de explotación / escenario:** Cambios de esquema, inputs inesperados o regresiones de tipado.
- **Notas:** Se combina con validaciones parciales en server actions.

### VIBE-002

- **ID:** VIBE-002
- **Severidad:** Medium
- **Categoría:** Vibe
- **Título corto:** Validación de negocio incompleta en server actions de tareas
- **Ubicación:** `app/actions/tasks.ts` (`createTask`, `updateTask`)
- **Evidencia:** `priority` se parsea desde `FormData` sin validación de rango en código (solo el CHECK DB actúa al final); `status` se toma del input.
- **Riesgo/Impacto:** Errores funcionales y respuestas de fallo tardías provenientes de DB en vez de validación consistente de capa servidor.
- **Condición de explotación / escenario:** Inputs manipulados fuera de UI.
- **Notas:** No implica bypass directo de RLS, pero sí robustez limitada.

### SEC-004

- **ID:** SEC-004
- **Severidad:** Low
- **Categoría:** Security
- **Título corto:** Mensajes de error crudos de autenticación expuestos al cliente
- **Ubicación:** `app/actions/auth.ts` (`signIn`, `signUp`, `requestPasswordReset`)
- **Evidencia:** Retorno directo de `error.message` de Supabase al frontend.
- **Riesgo/Impacto:** Filtración de detalles internos de flujo auth y potencial enumeración de estados/cuentas.
- **Condición de explotación / escenario:** Ataques de prueba/errores repetidos sobre login/signup/reset.
- **Notas:** Riesgo más de hardening e higiene de mensajes.

### PERF-003

- **ID:** PERF-003
- **Severidad:** Low
- **Categoría:** Performance
- **Título corto:** Revalidaciones amplias y repetidas en múltiples acciones
- **Ubicación:** `app/actions/*`, `app/notes/actions.ts`, `app/todo/actions.ts`, `app/clients/actions.ts`
- **Evidencia:** Uso recurrente de `revalidatePath('/dashboard')`, `revalidatePath('/project')`, `revalidatePath('/notes')`, etc. incluso para cambios puntuales.
- **Riesgo/Impacto:** Regeneraciones/cache invalidation más costosas de lo necesario y potencial degradación de UX.
- **Condición de explotación / escenario:** Alta frecuencia de mutaciones (arrastre de tareas, autosave, CRUD intensivo).
- **Notas:** Impacto incremental en carga del servidor.

### MAINT-001

- **ID:** MAINT-001
- **Severidad:** Low
- **Categoría:** Maintainability
- **Título corto:** Manejo de errores inconsistente y silencioso en puntos clave
- **Ubicación:** `lib/supabase/server.ts`, `app/notes/actions.ts`, múltiples server actions
- **Evidencia:** `catch {}` sin logging en `setAll`; en otras acciones se mezcla `throw`, `return { error }` y `console.error` de forma no uniforme.
- **Riesgo/Impacto:** Dificulta observabilidad, troubleshooting y control de fallas en producción.
- **Condición de explotación / escenario:** Incidentes intermitentes de sesión/cookies o fallos de DB.
- **Notas:** Relacionado con deuda técnica operativa.

### INFO-001

- **ID:** INFO-001
- **Severidad:** Info
- **Categoría:** Security
- **Título corto:** Configuración de seguridad HTTP no endurecida en `next.config`
- **Ubicación:** `next.config.mjs`
- **Evidencia:** Configuración vacía sin cabeceras de seguridad explícitas a nivel de framework.
- **Riesgo/Impacto:** Superficie de hardening pendiente (depende de infraestructura upstream).
- **Condición de explotación / escenario:** Entornos donde reverse proxy/CDN no inyecta headers defensivos.
- **Notas:** Hallazgo informativo condicionado al entorno de despliegue.

---

## 3. Mapa de Superficie de Ataque (si aplica)

### Middleware

- `middleware.ts` (protección por prefijos de ruta: `/dashboard`, `/project`, `/ideas`, `/todo`, `/budgets`, `/clients`, `/businesses`, `/notes`).

### Server actions (entrada mutante/lectura sensible)

- Auth: `app/actions/auth.ts`
- Projects/Favorites: `app/actions/projects.ts`
- Tasks: `app/actions/tasks.ts`
- Todo: `app/todo/actions.ts`
- Budgets: `app/budgets/actions.ts`, `app/budgets/[id]/actions.ts`
- Clients/Businesses/Links: `app/clients/actions.ts`
- Notes/Note links: `app/notes/actions.ts`
- Ideas: `app/ideas/actions.ts`, `app/ideas/[id]/project-link-actions.ts`
- Idea boards/canvas: `app/ideas/boards/actions.ts`, `app/ideas/boards/[id]/canvas/actions.ts`, `app/ideas/boards/[id]/canvas/connection-actions.ts`, `app/ideas/boards/[id]/canvas/batch-actions.ts`

### Capa de datos / políticas

- Migraciones RLS y esquema en `supabase/migrations/*.sql` (proyectos, tareas, presupuestos, ideas, clientes, negocios, notas, listas TODO).

---

## 4. Suposiciones y límites

- Revisión estática del código y migraciones del repositorio; no se ejecutaron pruebas dinámicas de explotación.
- No se validó configuración real de Supabase en entorno desplegado (políticas efectivas actuales, drift de schema, secretos runtime).
- No se revisaron recursos externos (infra/CDN/WAF) que podrían mitigar o agravar algunos hallazgos (p. ej., headers HTTP).
- No se inspeccionaron logs de producción ni telemetría para estimar frecuencia real de impacto.
