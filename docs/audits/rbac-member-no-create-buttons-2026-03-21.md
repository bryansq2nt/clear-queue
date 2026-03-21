# Audit: RBAC `canCreate = false` — Miembro del equipo sin botones de creación

**Fecha:** 2026-03-21
**Módulos afectados:** Board, Notes, Documents
**Síntoma:** Usuario con rol "miembro del equipo" ve las pestañas pero no ve botones de crear tarea, subir documento ni crear nota.

---

## Resumen ejecutivo

Trazada la cadena completa desde `board/page.tsx` → `getBoardPermissions` → `getGrantedActions` / `getCanUseModuleMemberContent` → `getRoleIdsForUserInProject` → BD. Se identificaron **tres escenarios distintos** que producen `canCreate = false`, dos de los cuales los backfills actuales **no corrigen por diseño**. El más probable (confianza alta) es que el usuario tenga un row `guest` en `user_role_assignments` — lo que hace que las migraciones 20260324200012/13/19 lo omitan deliberadamente con `NOT EXISTS`. El SQL de diagnóstico al final confirma o descarta cada escenario sin ambigüedad.

---

## 1. Mapa completo de la cadena de decisión

```
board/page.tsx
  └─ getBoardPermissions(projectId)  [cache()]
       ├─ projects.select('owner_id') → owner fast path
       ├─ getGrantedActions(userId, projectId, true)  [cache()]
       │    └─ getRoleIdsForUserInProject(userId, projectId)  [cache()]
       │         ├─ URA WHERE user_id=? AND project_id=?           ← Query 1
       │         ├─ projects.select('org_id,owner_id')             ← Query 2
       │         ├─ [if org_id] URA WHERE user_id=? AND org_id=?   ← Query 3
       │         └─ FALLBACK: if unique=[] AND user in project_members
       │              → rbac_roles WHERE name='team_member'        ← Query 4+5
       │    └─ rbac_role_module_actions.in('role_id', roleIds)
       │         → nested rbac_module_actions(action_key)          ← Query 6
       ├─ getReadScope(userId, projectId)  [NO cache()]
       │    └─ URA .maybeSingle() WHERE user_id=? AND project_id=? ← Query 7
       │         (uses embed: rbac_roles(name))
       └─ getCanUseModuleMemberContent(projectId, 'board')  [cache()]
            ├─ getCanViewModule → getProjectModules + getMyProjectAccessGrant
            │    ├─ project_modules WHERE project_id=?             ← Query 8
            │    └─ user_project_access_grants WHERE ...           ← Query 9
            │         + [if !team tab] project_team_members        ← Query 10
            ├─ getRoleIdsForUserInProject  (deduped by cache())
            ├─ if roleIds.length === 0 → return false  ← PUNTO CLAVE A
            └─ rbac_roles.select('name').in('id', roleIds)         ← Query 11
                 → isNonGuestContributorRole(roleNames)  ← PUNTO CLAVE B
```

**`canCreate = granted.has('tasks.create') || memberUse`**

---

## 2. Hipótesis H1–H7: verificadas por código

| ID     | Hipótesis                                         | Veredicto                                             | Evidencia en código                                                                                                                                                                                                                                                                                                       |
| ------ | ------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **H1** | URA con rol `guest`                               | **⚠️ MÁS PROBABLE — inconcluso sin SQL**              | Las migraciones 20260324200012/13/19 usan `NOT EXISTS(SELECT 1 FROM ura WHERE user_id=? AND project_id=?)` — si hay UN row (incluso `guest`), el backfill lo **salta**. `isNonGuestContributorRole(['guest']) = false`. `guest` solo tiene `*.read`. Resultado: `canCreate = false`.                                      |
| **H2** | `role_id` sin filas en `rbac_role_module_actions` | **Posible — inconcluso sin SQL**                      | Si `rbac_roles` tenía `team_member` pre-existente con un ID diferente al que el seed migration leyó, los `INSERT INTO rbac_role_module_actions` habrían apuntado a ese ID. Pero los inserts usan `WHERE r.name = 'team_member'` (no hardcoded ID), así que deberían ser correctos. Verificar con query Q6.                |
| **H3** | UI muestra rol incorrecto / múltiples URA rows    | **Confirmado como posible pero secundario**           | `getReadScope` usa `.maybeSingle()` sin `LIMIT 1` — fallará con PGRST116 si el usuario tiene >1 URA row para el mismo proyecto. Pero eso solo afecta `readScope`, no `canCreate`. La UI del Team tab (`get_project_members_with_profile`) usa `jsonb_agg` sin ORDER BY — rol mostrado puede no ser el efectivo.           |
| **H4** | `allowed_modules` restrictivo o ausente           | **Descartado como causa primaria**                    | Si `allowed_modules` no incluye 'board', `getCanViewModule` retorna `canView: false`, la pestaña desaparece en el tab bar, y la página muestra `ModuleDisabledView`. El síntoma es "ve tabs" → la pestaña es visible → `allowed_modules` incluye 'board' o es null.                                                       |
| **H5** | Módulo deshabilitado en `project_modules`         | **Descartado**                                        | Mismo razonamiento que H4. Si `board` estuviera project-disabled, la pestaña no aparecería en el sidebar. El user ve la pestaña.                                                                                                                                                                                          |
| **H6** | Proyecto sin `org_id` vs URA org-only             | **Descartado como causa**                             | Si `projects.org_id IS NULL`, el código simplemente salta la búsqueda de URA org-scoped. Solo reduce el conjunto de roles disponibles — no puede causar canCreate=false si el usuario ya tiene URA a nivel proyecto.                                                                                                      |
| **H7** | Código desplegado ≠ repo actual                   | **Inconcluso — no verificable sin acceso al entorno** | El fallback en `getRoleIdsForUserInProject` (líneas 89–117 de `lib/rbac/resolver.ts`) **sí existe en el código actual**. Si el bug persiste después del deploy más reciente, lo más probable es que el fallback no se activa porque el usuario SÍ tiene un URA row (de `guest`), no porque el código esté desactualizado. |

---

## 3. Tres escenarios raíz con cadena de evidencia

### Escenario A — Guest URA (confianza: ALTA)

```
project_invites.role_id = guest_role_id
  → accept_invite_atomic: INSERT INTO ura (user_id, guest_role_id, project_id)

Luego migraciones 20260324200012/13/19 ejecutan:
  NOT EXISTS (SELECT 1 FROM ura WHERE user_id=? AND project_id=?)
  → encuentra el row guest → NO inserta team_member

getRoleIdsForUserInProject:
  unique = [guest_role_id]  (length > 0 → fallback NO dispara)

getGrantedActions:
  rbac_role_module_actions WHERE role_id = guest_role_id
  → solo filas con action_key LIKE '%.read'
  → granted = {tasks.read, notes.read, documents.read, ...}
  → granted.has('tasks.create') = false

getCanUseModuleMemberContent:
  roleIds = [guest_role_id]  (length > 0)
  roleNames = ['guest']
  isNonGuestContributorRole(['guest'])
    → roleNames.every(n => n === 'guest') = true → return false
  memberUse = false

canCreate = false || false = false  ✓ (reproduce el síntoma)
```

**Por qué el debug anterior mostró `noUraRow: true`**: La sesión de debug fue anterior a las migraciones. Si el bug persiste HOY, hay dos opciones: (a) el user tenía un row `guest` que impidió el insert de backfill, o (b) la migración no corrió en el entorno correcto.

### Escenario B — URA con role_id huérfano (confianza: BAJA-MEDIA)

```
URA tiene role_id = algún UUID que:
  (a) no existe en rbac_roles, O
  (b) existe en rbac_roles pero no tiene entries en rbac_role_module_actions

getRoleIdsForUserInProject:
  unique = [orphan_id]  (length > 0 → fallback NO dispara)

getGrantedActions:
  rbac_role_module_actions.in('role_id', [orphan_id]) → [] empty
  granted = Set{}

getCanUseModuleMemberContent:
  roleIds = [orphan_id]
  rbac_roles.select('name').in('id', [orphan_id]) → [] empty
  roleNames = []
  isNonGuestContributorRole([]) → roleNames.length === 0 → false
  memberUse = false

canCreate = false || false = false  ✓ (reproduce el síntoma)
```

Este escenario requiere que el FK `ura.role_id → rbac_roles.id` no exista o se haya violado. Verificar con Q6.

### Escenario C — Sin URA y sin project_members (confianza: MEDIA — era la causa identificada antes)

```
No existe row en ura ni en project_members para (user, project)

getRoleIdsForUserInProject:
  projectRoles: []
  orgRoles: [] (o sin org)
  unique = []
  FALLBACK: project_members WHERE user_id=? AND project_id=? → null
  → fallback NO dispara
  → return []

getCanUseModuleMemberContent:
  roleIds.length === 0 → return false

canCreate = false || false = false  ✓
```

La migración 20260324200013 fue diseñada para esto. Si corrió correctamente, **este escenario debería estar resuelto**. Si el bug persiste, o la migración no corrió, o el usuario fue añadido después, o es Escenario A.

---

## 4. Bug adicional encontrado: `accept_invite_atomic` NOT EXISTS con role_id

En `20260324200010_fix_accept_invite_simplified_roles.sql`:

```sql
INSERT INTO public.user_role_assignments ...
WHERE NOT EXISTS (
  SELECT 1 FROM ura
  WHERE ura.user_id = p_user_id
    AND ura.role_id = v_invite.role_id     ← incluye role_id en el check
    AND ura.project_id = v_invite.project_id
);
```

**El problema**: si el usuario ya tiene un row con `role_id = guest_id`, y recibe una nueva invitación con `role_id = team_member_id`, el NOT EXISTS **no encuentra el guest row** (diferente `role_id`), y **sí inserta el team_member row**. Resultado: dos URA rows para el mismo (user, project).

Consecuencia en `getReadScope` (usa `.maybeSingle()` sin LIMIT): PostgREST devuelve error PGRST116 → `assignment = null` → `roleName = undefined` → scope = 'own'.

Consecuencia en `getRoleIdsForUserInProject`: colecta AMBOS role IDs → `roleNames = ['guest', 'team_member']` → `isNonGuestContributorRole` = true → canCreate = true. **Esto en realidad funciona**, pero `getReadScope` queda en 'own' (comportamiento incorrecto pero no bloqueante).

**Pendiente verificar**: ¿hay UNIQUE constraint en `(user_id, project_id)` en `user_role_assignments` (sin `role_id`)? Si la hay, el segundo INSERT en una re-invitación fallaría con un error de constraint no capturado.

---

## 5. Paquete SQL de diagnóstico

Ejecutar en Supabase SQL Editor con service_role. Reemplazar UUIDs literalmente.

```sql
-- ====================================================================
-- DIAGNÓSTICO RBAC — reemplaza los UUIDs antes de ejecutar
-- ====================================================================

-- Q1: Estado base del proyecto
SELECT id, name, owner_id, org_id
FROM public.projects
WHERE id = '<project_id>';

-- Q2: ¿El usuario está en project_members?
SELECT project_id, user_id, invited_by, created_at
FROM public.project_members
WHERE project_id = '<project_id>'
  AND user_id = '<user_id>';

-- Q3: TODAS las URA rows del usuario para este proyecto
-- Sano: 1 row, role_name = 'team_member'
-- Escenario A: role_name = 'guest'
-- Escenario B: role_name = NULL (role_id huérfano)
-- Escenario C: 0 rows
SELECT
  ura.id,
  ura.user_id,
  ura.project_id,
  ura.org_id,
  ura.role_id,
  r.name           AS role_name,
  r.is_system_role,
  ura.assigned_by,
  ura.created_at
FROM public.user_role_assignments ura
LEFT JOIN public.rbac_roles r ON r.id = ura.role_id
WHERE ura.user_id = '<user_id>'
  AND (
    ura.project_id = '<project_id>'
    OR ura.org_id = (
      SELECT org_id FROM public.projects WHERE id = '<project_id>'
    )
  );

-- Q4: Access grant — allowed_modules y read_scope
-- Sano: 1 row, allowed_modules incluye 'board' (o es null = unrestricted)
SELECT project_id, user_id, allowed_modules, read_scope, updated_at
FROM public.user_project_access_grants
WHERE project_id = '<project_id>'
  AND user_id = '<user_id>';

-- Q5: Módulos habilitados en el proyecto
-- Sano: board enabled = true
SELECT module_key, enabled
FROM public.project_modules
WHERE project_id = '<project_id>'
ORDER BY module_key;

-- Q6: ¿Cuántas acciones concede cada rol asignado al usuario?
-- Sano: team_member, has_tasks_create = true, granted_action_links > 0
-- Escenario A: guest, has_tasks_create = false
-- Escenario B: role_name NULL, granted_action_links = 0
WITH user_roles AS (
  SELECT DISTINCT ura.role_id
  FROM public.user_role_assignments ura
  WHERE ura.user_id = '<user_id>'
    AND (
      ura.project_id = '<project_id>'
      OR ura.org_id = (
        SELECT org_id FROM public.projects WHERE id = '<project_id>'
      )
    )
)
SELECT
  r.name                                           AS role_name,
  r.is_system_role,
  COUNT(rrma.action_id)                            AS granted_action_links,
  BOOL_OR(ma.action_key = 'tasks.create')          AS has_tasks_create,
  BOOL_OR(ma.action_key = 'notes.create')          AS has_notes_create,
  BOOL_OR(ma.action_key = 'documents.create')      AS has_documents_create,
  BOOL_OR(ma.action_key = 'tasks.read')            AS has_tasks_read
FROM user_roles ur
LEFT JOIN public.rbac_roles r ON r.id = ur.role_id
LEFT JOIN public.rbac_role_module_actions rrma ON rrma.role_id = ur.role_id
LEFT JOIN public.rbac_module_actions ma ON ma.id = rrma.action_id
GROUP BY r.name, r.is_system_role
ORDER BY r.name;

-- Q7: ¿El rol team_member tiene tasks.create en el sistema?
-- Sano: has_tasks_create = true, total_actions > 40
SELECT
  r.id,
  r.name,
  COUNT(rrma.action_id)                       AS total_actions,
  BOOL_OR(ma.action_key = 'tasks.create')     AS has_tasks_create,
  BOOL_OR(ma.action_key = 'notes.create')     AS has_notes_create,
  BOOL_OR(ma.action_key = 'documents.create') AS has_documents_create
FROM public.rbac_roles r
LEFT JOIN public.rbac_role_module_actions rrma ON rrma.role_id = r.id
LEFT JOIN public.rbac_module_actions ma ON ma.id = rrma.action_id
WHERE r.name = 'team_member' AND r.is_system_role = true
GROUP BY r.id, r.name;

-- Q8: Invitaciones recientes para el usuario en este proyecto
-- Ayuda a saber con qué role_id fue invitado originalmente
SELECT
  pi.id,
  pi.email,
  pi.status,
  pi.role_id,
  r.name           AS role_name,
  pi.allowed_modules,
  pi.accepted_at,
  pi.created_at
FROM public.project_invites pi
LEFT JOIN public.rbac_roles r ON r.id = pi.role_id
WHERE pi.project_id = '<project_id>'
ORDER BY pi.created_at DESC
LIMIT 20;

-- Q9: ¿Algún usuario tiene >1 URA row en este proyecto? (detección de duplicados)
SELECT
  ura.user_id,
  COUNT(*) AS ura_row_count,
  array_agg(r.name ORDER BY r.name) AS role_names
FROM public.user_role_assignments ura
JOIN public.rbac_roles r ON r.id = ura.role_id
WHERE ura.project_id = '<project_id>'
GROUP BY ura.user_id
HAVING COUNT(*) > 1;
```

---

## 6. Causa raíz más probable

| Escenario                      | Confianza                    | Discriminador SQL                                         |
| ------------------------------ | ---------------------------- | --------------------------------------------------------- |
| **A — URA con rol `guest`**    | **ALTA**                     | Q3: `role_name = 'guest'`; Q6: `has_tasks_create = false` |
| B — role_id huérfano           | BAJA                         | Q3: `role_name = NULL`; Q6: `granted_action_links = 0`    |
| C — Sin URA ni project_members | MEDIA (era el caso anterior) | Q2: 0 rows; Q3: 0 rows                                    |

Para llegar al 100% de confianza: ejecutar Q3 y Q6 con los UUIDs reales en el entorno donde se reproduce el bug. El valor de `role_name` en Q3 es el diagnóstico definitivo.

---

## 7. Siguiente paso recomendado

1. **Ejecutar Q3 + Q6** en el entorno afectado.
   - `role_name = 'guest'` → **Escenario A**: cambiar el rol en URA de `guest` a `team_member` (UPDATE directo), o re-invitar al usuario como `team_member`.
   - `role_name IS NULL` → **Escenario B**: verificar FK en URA y hacer UPDATE del `role_id`.
   - 0 rows → **Escenario C**: re-aplicar migración 20260324200013 o insertar manualmente.

2. Si es Escenario A: evaluar si el invite flow permite enviar invitaciones con rol `guest` cuando debería ser `team_member`. El cambio de rol no puede ser automático — requiere decisión de producto sobre alcance.

3. **No aplicar más backfills ciegos** hasta confirmar el escenario. Un backfill que convierta todos los `guest` en `team_member` rompería proyectos donde los guests son intencionalmente guests.

---

## Archivos auditados

| Archivo                                                                                 | Relevancia                                                        |
| --------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `lib/rbac/resolver.ts`                                                                  | `getRoleIdsForUserInProject`, `getGrantedActions`, fallback logic |
| `lib/rbac/member-module-use.ts`                                                         | `isNonGuestContributorRole` — decide si memberUse = true          |
| `lib/rbac/read-scope.ts`                                                                | `getReadScope` — .maybeSingle() issue con múltiples URA rows      |
| `app/actions/modules.ts`                                                                | `getCanUseModuleMemberContent`, `getMyProjectAccessGrant`         |
| `app/actions/tasks.ts`                                                                  | `getBoardPermissions` — formula final de canCreate                |
| `app/context/[projectId]/board/page.tsx`                                                | Orden de evaluación en el render del servidor                     |
| `supabase/migrations/20260324200001_seed_simplified_roles.sql`                          | Roles, action keys, grants                                        |
| `supabase/migrations/20260324200010_fix_accept_invite_simplified_roles.sql`             | `accept_invite_atomic` — bug en NOT EXISTS con role_id            |
| `supabase/migrations/20260324200012_backfill_member_role_assignments.sql`               | Backfill desde project_members                                    |
| `supabase/migrations/20260324200013_robust_ura_backfill.sql`                            | Backfill desde user_project_access_grants                         |
| `supabase/migrations/20260324200019_backfill_user_role_assignments_missing_members.sql` | Segundo intento de backfill desde project_members                 |
| `app/api/debug/project-access/route.ts`                                                 | Endpoint de diagnóstico                                           |
