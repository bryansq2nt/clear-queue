# Reporte: Optimización de carga de la página de perfil

**Fecha:** 2025-02-15  
**Alcance:** Eliminación del fetch en `useEffect` en ProfilePageClient y migración de la carga de datos al servidor.  
**Resultado observado:** La página de perfil carga aproximadamente **3 veces más rápido**.

---

## 1. Resumen ejecutivo

Se aplicaron dos optimizaciones encadenadas para reducir solicitudes duplicadas y el tiempo de carga de la página de perfil:

1. **React `cache()`** en las server actions de perfil, preferencias y proyectos para deduplicar llamadas en el mismo request de servidor.
2. **Carga de datos en el servidor** en la ruta `/profile`: el servidor obtiene perfil, preferencias y URL del avatar y los pasa al cliente como props; se eliminó el `useEffect` que hacía ese mismo fetch en el cliente.

Con esto se eliminó la doble carga (servidor + cliente), se redujeron las POSTs en el ciclo de render y se mejoró notablemente la percepción de velocidad (≈3x más rápido según medición en uso real).

---

## 2. Problema anterior

### 2.1 Flujo de carga (antes)

1. **Layout / navegación:** Sidebar y Header ya llamaban a `getProjectsForSidebar()` y `getProfile()` (varias POSTs).
2. **Página de perfil:** `ProfilePageClient` se montaba y en un `useEffect` ejecutaba:
   - `getProfileWithAvatar()` → a su vez llama a `getProfile()` (duplicado con el header).
   - `getPreferences()`.
   - `getAssetSignedUrl(avatar_asset_id)` si había avatar.
3. **React Strict Mode (dev):** duplicaba la ejecución del efecto, multiplicando las POSTs.

### 2.2 Consecuencias

- **Muchas POSTs por carga:** del orden de ~16 POSTs en el ciclo completo (contando layout, perfil y Strict Mode).
- **Tiempo de carga lento:** el usuario veía primero un spinner y luego los datos, con un round-trip extra desde el cliente.
- **Datos duplicados:** `getProfile()` se ejecutaba desde el header y de nuevo dentro de `getProfileWithAvatar()`.

Documentación del análisis previo del `useEffect`: `PROFILE_USEEFFECT_AUDIT.md`.

---

## 3. Solución aplicada

### 3.1 Fase 1: React `cache()` en server actions

Se envolvieron con `cache()` las funciones que solo **leen** datos, para que en un mismo request de servidor se dedupliquen las llamadas:

| Archivo                              | Funciones envueltas con `cache()`                         |
| ------------------------------------ | --------------------------------------------------------- |
| `app/settings/profile/actions.ts`    | `getProfile`, `getProfileWithAvatar`, `getAssetSignedUrl` |
| `app/settings/appearance/actions.ts` | `getPreferences`                                          |
| `app/actions/projects.ts`            | `getProjectsForSidebar`                                   |

Las mutaciones (`updateProfile`, `uploadUserAsset`, `deleteUserAsset`, `updatePreferences`, etc.) **no** se cachean.

**Commit:** `perf: add React cache() to deduplicate server action calls`

### 3.2 Fase 2: Datos de perfil desde el servidor (Option B)

En lugar de que el cliente cargue los datos en `useEffect`, la **página** de perfil es un **Server Component async** que:

1. Llama en paralelo a `getProfileWithAvatar()` y `getPreferences()`.
2. Si el perfil tiene avatar, llama a `getAssetSignedUrl(profile.avatar_asset_id)`.
3. Pasa `profile`, `preferences` e `initialAvatarUrl` al cliente como **props**.

El componente cliente **ProfilePageClient**:

- Recibe `profile`, `preferences` e `initialAvatarUrl` y los usa como estado inicial (sin fetch en `useEffect`).
- Elimina el estado `isLoading` y el spinner inicial; el contenido se muestra de inmediato con los datos del servidor.
- Mantiene toda la interactividad: envío del formulario, subida/eliminación de avatar, cambios de locale/currency, etc., llamando a las mismas server actions que antes.

**Commit:** `perf: move profile data fetching to server side`

---

## 4. Archivos modificados (Fase 2)

| Archivo                                      | Cambio                                                                                                                                                                                                                     |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app/profile/page.tsx`                       | Convertido en async Server Component; hace `getProfileWithAvatar()`, `getPreferences()` y `getAssetSignedUrl()` y pasa props a `ProfilePageClient`.                                                                        |
| `app/settings/profile/ProfilePageClient.tsx` | Acepta props `profile`, `preferences`, `initialAvatarUrl`; elimina `useEffect` y `loadProfile`; inicializa estado desde props; elimina spinner de carga inicial; mantiene imports de tipos desde las actions (solo tipos). |

---

## 5. Impacto esperado y observado

### 5.1 Antes (estimado)

- Sidebar: `getProjectsForSidebar()` → POST.
- Header: `getProfile()` → POST.
- ProfilePageClient montado → `useEffect`:
  - `getProfileWithAvatar()` → POST (y dentro `getProfile()` → POST).
  - `getPreferences()` → POST.
  - `getAssetSignedUrl()` → POST si hay avatar.
- Strict Mode (dev): efecto duplicado → misma secuencia otra vez.  
  **Total:** del orden de ~16 POSTs.

### 5.2 Después (con `cache()` + carga en servidor)

- Sidebar: `getProjectsForSidebar()` → POST (cacheada en el request).
- Header: `getProfile()` → POST (cacheada).
- Página `/profile` (servidor):
  - `getProfileWithAvatar()` → POST; `getProfile()` interno usa cache (0 POST extra).
  - `getPreferences()` → POST.
  - `getAssetSignedUrl()` → POST si hay avatar.
- Cliente: recibe props, **sin** fetch en `useEffect`.  
  **Total:** del orden de ~4 POSTs (reducción importante en el ciclo de carga).

### 5.3 Resultado en uso

- **Percepción de velocidad:** la página de perfil carga aproximadamente **3 veces más rápido** (sin esperar round-trip de cliente para ver los datos).
- **Menos solicitudes:** menos POSTs por carga y sin duplicar `getProfile()` entre header y perfil gracias a `cache()`.

---

## 6. Referencias

- **Auditoría del useEffect (antes del cambio):** `PROFILE_USEEFFECT_AUDIT.md`
- **Fixes de arquitectura y reglas:** `docs/reports/REPORTE-FIXES-ARQUITECTURA.md`
- **Patrones de server actions:** `docs/patterns/server-actions.md`
