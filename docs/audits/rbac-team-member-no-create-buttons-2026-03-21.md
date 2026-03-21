# Audit: Miembro del equipo sin botones de crear (Etapas / Documentos / Notas)

**Fecha:** 2026-03-21  
**Contexto:** Tras aplicar migraciones (incl. backfill `user_role_assignments`), un usuario sigue sin ver acciones de creación en los módulos del contexto.  
**Objetivo:** Mapear la cadena real de decisión en código y en BD, listar hipótesis verificables **antes** de aplicar más cambios de producto.

**Prompt para Claude Code (audit más profundo + SQL):** `docs/prompts/claude-code-rbac-member-no-create-audit.md`

---

## 1. Cómo se decide `canCreate` en la UI (cadena completa)

### 1.1 Pestañas visibles (`ContextLayoutWrapper`)

- Fuente: `getMyProjectAccessGrant` → `user_project_access_grants.allowed_modules`.
- `null` = sin restricción de pestañas (respecto al proyecto).
- `string[]` = allowlist: solo esas claves de módulo (`board`, `notes`, `documents`, …).
- `undefined` = **sin fila** en `user_project_access_grants` (no owner) → **ninguna pestaña** (fail-closed).

**Si el usuario ve Etapas / Documentos / Notas**, en principio tiene fila de grant **y** las claves necesarias **o** `allowed_modules` es `null`.

### 1.2 Entrada al módulo (`board` / `notes` / `documents` `page.tsx`)

Cada página hace:

1. `getCanViewModule(projectId, '<moduleKey>')`
   - Proyecto: módulo habilitado en `project_modules` **y** usuario con acceso según grant (`grant === null` o `grant.includes(moduleKey)`).
2. Si `!canView && reason` → `ModuleDisabledView` (no se monta el cliente con datos normales).

**Si el usuario ve el tablero vacío con filtros y no la pantalla “módulo deshabilitado”**, `canView` es **true** para ese módulo.

### 1.3 Permisos pasados al cliente (`permissions`)

| Módulo     | Acción principal                           | Fórmula en código                                               |
| ---------- | ------------------------------------------ | --------------------------------------------------------------- |
| Board      | `getBoardPermissions` (`tasks.ts`)         | `canCreate = granted.has('tasks.create') \|\| memberUse`        |
| Notas      | `getNotesPermissions` (`notes.ts`)         | `canCreate = granted.has('notes.create') \|\| memberUse`        |
| Documentos | `getDocumentsPermissions` (`documents.ts`) | `canUpload` / carpetas análogas con `documents.*` y `memberUse` |

Donde:

- `granted` = `getGrantedActions(userId, projectId, true)` → expansión vía `user_role_assignments` → `rbac_role_module_actions` → claves `*.create`, etc.
- `memberUse` = `getCanUseModuleMemberContent(projectId, moduleKey)` (`modules.ts`).

### 1.4 `getCanUseModuleMemberContent` (clave para “UX de colaborador”)

Condiciones **todas** necesarias:

1. `getCanViewModule` → `canView === true` (mismo criterio que arriba).
2. No ser owner del proyecto (el owner retorna `true` antes).
3. `getRoleIdsForUserInProject` → **array no vacío** después de:
   - URA con `project_id` = proyecto,
   - URA con `org_id` = `projects.org_id` (si el proyecto tiene org),
   - **Fallback código (resolver):** si no hay ningún `role_id` pero existe fila en `project_members` y el usuario no es `owner_id`, se inyecta el `id` del rol de sistema `team_member` (si existe en `rbac_roles`).
4. Cargar nombres: `rbac_roles` con `.in('id', roleIds)` → `isNonGuestContributorRole(roleNames)` debe ser **true** (incluye `team_member`, `team_manager`, `project_manager`, `owner`; **excluye** solo `guest`).

**Conclusión:** Si el usuario tiene **solo** rol `guest` en URA (proyecto u org), `memberUse` es **false** y solo quedarían permisos `*.read` → **sin crear**, aunque esté en un sub-equipo con rol “member” en `project_team_members`.

---

## 2. Desalineación conocida: “Tu rol” en Equipo vs RBAC efectivo

En `ContextTeamClient`, el nombre mostrado como **rol en el proyecto** sale de:

```ts
members.find((m) => m.user_id === currentUserId)?.roles[0]?.name;
```

`listProjectMembers` usa el RPC `get_project_members_with_profile`, que agrega roles **solo** de:

`user_role_assignments` donde `project_id = p_project_id`.

**No** incluye asignaciones **solo** a nivel organización (`org_id` sin `project_id`).

Además, el subquery usa `jsonb_agg(...)` **sin `ORDER BY`**: si hubiera **más de un** rol de proyecto por usuario, el orden de `roles[0]` es **no determinista** → la etiqueta puede mostrar un rol distinto al que el desarrollador asume.

Los permisos reales (`getGrantedActions`, `getRoleIdsForUserInProject`) **sí** unen roles de proyecto **y** de organización. Por tanto:

- Es posible **etiqueta “team_member”** (o vacía) **y** permisos distintos, o al revés, según datos.
- Es posible creer que alguien es “Miembro del equipo” por **sub-equipo** (`project_team_members.role = 'member'`) mientras el **URA** sigue siendo `guest` o hay incoherencia de datos.

---

## 3. Por qué la migración de backfill puede no cambiar el comportamiento

La migración `20260324200012` / `20260324200019` solo inserta URA `team_member` cuando:

```sql
NOT EXISTS (ura para ese user_id + project_id)
```

**No** modifica usuarios que **ya tienen** una fila URA con otro rol (p. ej. **`guest`**).  
En ese caso:

- Siguen con permisos de invitado (solo lectura en RBAC seed).
- Siguen sin `tasks.create` / `notes.create` / `documents.create`.
- El backfill **no aplica**.

Esto encaja con “apliqué la migración y no pasó nada”.

---

## 4. Hipótesis ordenadas por probabilidad (a validar con datos)

| #   | Hipótesis                                                                                                                  | Cómo se manifiesta                                                                             |
| --- | -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| H1  | URA con rol **`guest`** (invitación como invitado / módulos lectura)                                                       | Pestañas visibles si el grant lo permite; **sin** acciones de creación.                        |
| H2  | `role_id` en URA apunta a un rol **sin** filas en `rbac_role_module_actions` (rol custom roto, seed parcial, otro entorno) | `granted` vacío o sin `*.create`; `memberUse` puede ser false si el nombre no es contributor.  |
| H3  | Múltiples roles proyecto; **UI** muestra `roles[0]` no determinista                                                        | Etiqueta engañosa; permisos reales = unión de roles (aun así revisar duplicados guest+member). |
| H4  | Código desplegado **sin** el fallback en `getRoleIdsForUserInProject` (solo migración aplicada)                            | Sin URA y sin fallback en app → todo en false.                                                 |
| H5  | `user_project_access_grants` ausente (`undefined`) pero usuario “ve” algo por caché o otra ruta                            | Menos probable si la regla fail-closed oculta tabs; igualmente verificar grant.                |

---

## 5. Herramientas ya existentes en el repo

- **`GET /api/debug/project-access?projectId=<uuid>`** (solo `NODE_ENV === 'development'`): devuelve grant, `roleIds`, nombres resueltos, `memberUse` por módulo, flags `canCreateTask`, etc.  
  Archivo: `app/api/debug/project-access/route.ts`.

**Uso recomendado:** iniciar sesión como el usuario afectado, abrir esa URL con el `projectId` del proyecto “Test” (o el que corresponda) y guardar el JSON.

---

## 6. Consultas SQL sugeridas (Supabase SQL editor)

Sustituir `:user_id` y `:project_id`.

```sql
-- URA proyecto + org del proyecto
SELECT ura.*, r.name AS role_name
FROM user_role_assignments ura
JOIN rbac_roles r ON r.id = ura.role_id
JOIN projects p ON p.id = :project_id
WHERE ura.user_id = :user_id
  AND (ura.project_id = :project_id OR ura.org_id = p.org_id);

-- Grant de módulos
SELECT * FROM user_project_access_grants
WHERE user_id = :user_id AND project_id = :project_id;

-- ¿Existe create para los roles del usuario?
SELECT r.name, COUNT(rrma.action_id) AS action_links
FROM user_role_assignments ura
JOIN rbac_roles r ON r.id = ura.role_id
JOIN projects p ON p.id = :project_id
LEFT JOIN rbac_role_module_actions rrma ON rrma.role_id = r.id
WHERE ura.user_id = :user_id
  AND (ura.project_id = :project_id OR ura.org_id = p.org_id)
GROUP BY r.name;
```

---

## 7. Qué **no** haré todavía (hasta tener evidencia)

- No añadir otro backfill ciego sin saber si el usuario es `guest` por diseño.
- No cambiar la semántica de `guest` sin decisión de producto.
- No asumir que “Miembro del equipo” en pantalla = `rbac_roles.name = 'team_member'` sin cruzar URA.

---

## 8. Plan de trabajo propuesto **después** de este audit

1. **Recoger evidencia:** JSON del endpoint de debug (dev) o resultados de las SQL de la sección 6 para el usuario y proyecto concretos.
2. **Clasificar:** H1–H5 según `role_name` y `grantedActions`.
3. **Corrección acotada según causa:**
   - Si **guest** y se esperaba colaborador: corregir datos (URA + invite) o flujo de invitación, no solo UI.
   - Si **rol sin acciones**: reparar `rbac_role_module_actions` / `role_id` huérfano.
   - Si **solo orden/UX de etiqueta**: `ORDER BY` en el RPC o mostrar rol “efectivo” alineado con `getGrantedActions`.
   - Si **fallback app no desplegado**: asegurar release del `lib/rbac/resolver.ts` actualizado.
4. Opcional: extender `/api/debug/project-access` o un log estructurado temporal para staging (sin depender solo de dev).

---

## 9. Referencias de código

- `app/actions/modules.ts` — `getMyProjectAccessGrant`, `getCanViewModule`, `getCanUseModuleMemberContent`
- `app/actions/tasks.ts` — `getBoardPermissions`
- `app/actions/notes.ts` — `getNotesPermissions`
- `app/actions/documents.ts` — `getDocumentsPermissions`
- `lib/rbac/resolver.ts` — `getRoleIdsForUserInProject`, `getGrantedActions`
- `lib/rbac/member-module-use.ts` — `isNonGuestContributorRole`
- `supabase/migrations/20260310100010_project_invites.sql` — `get_project_members_with_profile`
- Migraciones backfill: `20260324200012`, `20260324200019`

---

## 10. Resumen ejecutivo

Los botones de crear dependen de **permisos RBAC** (`tasks.create`, `notes.create`, `documents.create`, …) **o** de `getCanUseModuleMemberContent`, que exige un rol **no invitado** (`team_member` y similares). La migración de backfill **solo rellena URA cuando no hay ninguna fila**; no convierte un **`guest`** en **`team_member`**. Además, la tarjeta “Tu rol” en Equipo puede **no** reflejar la misma fuente que `getGrantedActions` (org vs proyecto, orden de `jsonb_agg`).

**Próximo paso obligatorio:** confirmar con debug/SQL el `role_name` real y las acciones concedidas para ese usuario; con eso se elige un fix único y se evita otro intento a ciegas.
