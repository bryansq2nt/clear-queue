# Prompt para Claude Code — Audit profundo: miembro sin permisos de creación

**Uso:** Pega este documento completo (o la sección “Instrucciones para el agente”) en Claude Code como tarea principal.  
**Objetivo:** **No implementar fixes todavía.** Primero validar en **código + base de datos** por qué un usuario con apariencia de “miembro del equipo” no ve botones de crear en Etapas / Documentos / Notas.

**Documento relacionado en el repo:** `docs/audits/rbac-team-member-no-create-buttons-2026-03-21.md` (cadena de permisos y hipótesis iniciales).

---

## Instrucciones para el agente (Claude Code)

### Rol que debes asumir

Eres un ingeniero que debe **auditar** un bug de permisos RBAC en ClearQueue. El usuario y otro asistente ya sospechan causas; **tu trabajo no es creerlas ciegamente**: debes **confirmar o refutar** cada hipótesis con evidencia del **código actual** y, cuando sea posible, con **consultas SQL** que el humano puede ejecutar en Supabase (SQL Editor o `psql`).

### Reglas

1. **No implementes soluciones de producto** (cambios de lógica, migraciones nuevas, refactors) hasta que el audit esté **cerrado** con un informe que incluya:
   - Estado verificado en BD (o “no verificado” con motivo).
   - Rutas de código exactas que deciden `canCreate` / `memberUse`.
   - Conclusión: causa raíz más probable **con nivel de confianza** (alta/media/baja).
2. **Ve más profundo que el audit previo:** traza llamadas reales, caches (`react` `cache()`), orden de evaluación en `page.tsx`, y cualquier RPC o política RLS que afecte lectura de `rbac_roles`, `user_role_assignments`, `rbac_role_module_actions`.
3. **Entrega SQL reproducible:** bloques con placeholders `:project_id`, `:user_id`, `:user_email` y una breve nota de qué resultado esperar en escenarios sanos vs rotos.
4. Si algo no se puede inferir sin datos reales, **di explícitamente** qué fila o qué JSON necesitas del usuario.

### Contexto del problema (síntomas)

- Usuario “miembro del equipo” **ve** módulos (pestañas) pero **no** ve acciones para crear tareas, carpetas, notas o subir documentos.
- Ya se aplicaron migraciones (incl. backfills de `user_role_assignments`); el comportamiento **persiste**.

### Hallazgos previos (otro asistente) — trátalos como hipótesis, no como verdad

1. **`canCreate`** en board/notas/documentos depende de `getGrantedActions` **y/o** `getCanUseModuleMemberContent` (`app/actions/modules.ts`, `app/actions/tasks.ts`, `app/actions/notes.ts`, `app/actions/documents.ts`).
2. El backfill que inserta `team_member` en URA **solo aplica** cuando **no existe ninguna** fila `user_role_assignments` para `(user_id, project_id)`. Si el usuario ya tiene URA con rol **`guest`**, **no** se convierte automáticamente en colaborador → permisos solo lectura.
3. La UI de Equipo puede mostrar “Miembro del equipo” usando `roles[0]` desde `get_project_members_with_profile`, con `jsonb_agg` **sin ORDER BY** y roles **solo** de URA con `project_id` (no refleja bien roles **solo** de org). Puede desalinearse del RBAC efectivo.
4. Existe endpoint de debug en dev: `GET /api/debug/project-access?projectId=<uuid>` (`app/api/debug/project-access/route.ts`).

### Hipótesis que debes validar (checklist)

| ID  | Hipótesis                                                                     | Qué probar                                     |
| --- | ----------------------------------------------------------------------------- | ---------------------------------------------- |
| H1  | URA con rol `guest` (invitación como invitado)                                | SQL: `ura` + `rbac_roles.name`                 |
| H2  | `role_id` apunta a rol sin filas en `rbac_role_module_actions`                | SQL: join `ura` → `rrma` counts                |
| H3  | Múltiples URA proyecto; UI muestra rol equivocado                             | SQL: count rows per user/project; revisar RPC  |
| H4  | `user_project_access_grants` restrictivo o ausente                            | SQL: fila `allowed_modules`                    |
| H5  | Módulos deshabilitados en `project_modules`                                   | SQL: `enabled` por clave                       |
| H6  | Proyecto sin `org_id` vs URA org-only (edge cases)                            | SQL: `projects` + `ura`                        |
| H7  | Código desplegado distinto al repo (fallback en `getRoleIdsForUserInProject`) | Diff / commit / revisar `lib/rbac/resolver.ts` |

### Archivos que debes leer como mínimo

- `lib/rbac/resolver.ts` — `getRoleIdsForUserInProject`, `getGrantedActions`, `can`
- `lib/rbac/member-module-use.ts` — `isNonGuestContributorRole`
- `lib/rbac/read-scope.ts` — `getReadScope`
- `app/actions/modules.ts` — `getMyProjectAccessGrant`, `getCanViewModule`, `getCanUseModuleMemberContent`
- `app/actions/tasks.ts` — `getBoardPermissions`
- `app/actions/notes.ts` — `getNotesPermissions`
- `app/actions/documents.ts` — `getDocumentsPermissions`
- `app/context/[projectId]/board/page.tsx` (y análogos notes/documents)
- `app/context/[projectId]/ContextLayoutWrapper.tsx` — intersección grant × módulos habilitados
- `supabase/migrations/20260310100010_project_invites.sql` — función `get_project_members_with_profile`
- Migraciones: `20260324200001_seed_simplified_roles.sql`, `20260324200012_*`, `20260324200019_*`

### Paquete SQL sugerido (el humano sustituye UUIDs)

**Nota:** La sintaxis `:'project_id'` es de **psql**. En **Supabase SQL Editor** suele bastar con reemplazar por literales, p. ej. `'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'::uuid` (o sin cast según el editor).

Ejecutar con un rol que pueda leer tablas `public` (el SQL editor con permisos de servicio suele ver todo). Ajusta esquema si no es `public`.

```sql
-- === 0) Identificadores (reemplazar) ===
-- :project_id  UUID del proyecto
-- :user_id     UUID del usuario afectado

-- === 1) Proyecto: owner y org ===
SELECT id, name, owner_id, org_id
FROM public.projects
WHERE id = :'project_id';

-- === 2) ¿Es miembro de proyecto? ===
SELECT *
FROM public.project_members
WHERE project_id = :'project_id' AND user_id = :'user_id';

-- === 3) URA: proyecto + org del proyecto (misma lógica que getRoleIdsForUserInProject) ===
SELECT
  ura.id,
  ura.user_id,
  ura.project_id,
  ura.org_id,
  ura.role_id,
  r.name AS role_name,
  r.is_system_role
FROM public.user_role_assignments ura
JOIN public.rbac_roles r ON r.id = ura.role_id
JOIN public.projects p ON p.id = :'project_id'
WHERE ura.user_id = :'user_id'
  AND (
    ura.project_id = :'project_id'
    OR (p.org_id IS NOT NULL AND ura.org_id = p.org_id)
  );

-- === 4) Grant de módulos (pestañas) ===
SELECT project_id, user_id, allowed_modules, read_scope, updated_at
FROM public.user_project_access_grants
WHERE project_id = :'project_id' AND user_id = :'user_id';

-- === 5) Módulos habilitados en el proyecto ===
SELECT module_key, enabled
FROM public.project_modules
WHERE project_id = :'project_id'
ORDER BY module_key;

-- === 6) ¿Cuántas acciones concede cada rol asignado al usuario? ===
WITH ura AS (
  SELECT ura.role_id
  FROM public.user_role_assignments ura
  JOIN public.projects p ON p.id = :'project_id'
  WHERE ura.user_id = :'user_id'
    AND (
      ura.project_id = :'project_id'
      OR (p.org_id IS NOT NULL AND ura.org_id = p.org_id)
    )
),
role_ids AS (SELECT DISTINCT role_id FROM ura)
SELECT
  r.name AS role_name,
  COUNT(rrma.action_id) AS granted_action_links,
  BOOL_OR(ma.action_key = 'tasks.create') AS has_tasks_create,
  BOOL_OR(ma.action_key = 'notes.create') AS has_notes_create,
  BOOL_OR(ma.action_key = 'documents.create') AS has_documents_create
FROM role_ids
JOIN public.rbac_roles r ON r.id = role_ids.role_id
LEFT JOIN public.rbac_role_module_actions rrma ON rrma.role_id = r.id
LEFT JOIN public.rbac_module_actions ma ON ma.id = rrma.action_id
GROUP BY r.name
ORDER BY r.name;

-- === 7) Rol de sistema team_member: existe y tiene acciones create clave ===
SELECT r.id, r.name, COUNT(rrma.action_id) AS action_count
FROM public.rbac_roles r
LEFT JOIN public.rbac_role_module_actions rrma ON rrma.role_id = r.id
WHERE r.name = 'team_member' AND r.is_system_role = true
GROUP BY r.id, r.name;

-- === 8) Invitaciones aceptadas recientes (contexto) ===
SELECT id, email, status, role_id, allowed_modules, team_id, accepted_at
FROM public.project_invites
WHERE project_id = :'project_id'
ORDER BY created_at DESC
LIMIT 20;
```

### Qué debe contener tu informe final (salida esperada)

1. **Resumen ejecutivo** (5–10 líneas).
2. **Tabla:** hipótesis H1–H7 → Verificado / Descartado / Inconcluso + evidencia.
3. **Causa raíz** con confianza y qué dato faltaría para llegar al 100%.
4. **SQL adicional** que hayas necesitado (si los genéricos no bastaron).
5. **Siguiente paso recomendado** (solo recomendación; la implementación es decisión del equipo).

### Lo que NO debes hacer en esta tarea

- No merges, no PR, no migraciones nuevas salvo que el usuario pida explícitamente una migración de **solo diagnóstico** (raro).
- No asumir que “migración aplicada” = “código desplegado igual al repo”.

---

## Notas para el humano (dueño del repo)

- El endpoint `GET /api/debug/project-access` solo funciona con `NODE_ENV=development`; inicia sesión como el usuario afectado y abre la URL con el `projectId` correcto.
- Si usas **varios entornos** (local vs staging vs prod), el estado de BD **no** es el mismo: ejecuta el SQL en el entorno donde reproduciste el bug.
- Guarda el JSON del debug y/o capturas de resultados SQL para comparar después de cualquier fix futuro.
