# Plan: Agregar cliente / Agregar empresa en Responsable del proyecto

## Objetivo

Cuando el usuario está en **Responsable del proyecto** y el proyecto **no tiene cliente ni empresa** asignados:

1. Mostrar botones **Agregar cliente** y **Agregar empresa** (reutilizando modales y flujos existentes).
2. Dejar de usar el enlace **Editar Proyecto** que llevaba a la vista antigua (`/project/[id]` Kanban con sidebar).
3. Tras crear un cliente o una empresa desde estos botones, vincularlos al proyecto actual y refrescar la vista.

## Estado actual

- **Vista:** `app/context/[projectId]/owner/` → `ContextOwnerFromCache` → `ContextOwnerClient`.
- **Empty state:** Un solo enlace "Editar Proyecto" a `href={/project/${project.id}}` (vista vieja).
- **Modales existentes:** `CreateClientModal`, `CreateBusinessModal` (en `app/clients/components/`).
- **Acciones:** `createClientAction`, `createBusinessAction` (devuelven `{ data?: Client/Business }`), `updateProject(formData)` acepta `id`, `client_id`, `business_id`.

## Cambios

### 1. Modales: callback con entidad creada

- **CreateClientModal:** `onCreated?: () => void` → `onCreated?: (client?: Client) => void`. Tras éxito, llamar `onCreated(result.data)`.
- **CreateBusinessModal:** `onCreated?: () => void` → `onCreated?: (business?: Business) => void`. Tras éxito, llamar `onCreated(result.data)`.
- Usos actuales (p. ej. ClientsPageClient) siguen funcionando: `onCreated={() => loadClients()}` o `onCreated((c) => { loadClients(); })`.

### 2. ContextOwnerClient: empty state

- **Quitar** el `Link` a `/project/${project.id}` con "Editar Proyecto".
- **Añadir** dos botones/links de acción:
  - **Agregar cliente** → abre `CreateClientModal`.
  - **Agregar empresa** → abre `CreateBusinessModal`.
- Traducciones: reutilizar `clients.add_client` y `businesses.add_business` (ya existen).
- Props nuevas: `onOwnerUpdated?: () => void` (callback para refrescar datos del owner tras vincular).

### 3. Flujo al crear desde owner

- **Al crear cliente:**  
  `onCreated(client)` → si `client`, construir `FormData` con `id=project.id`, `client_id=client.id` → `updateProject(formData)` → `onOwnerUpdated()` (invalidar cache owner y recargar).
- **Al crear empresa:**  
  `onCreated(business)` → si `business`, `FormData` con `id=project.id`, `business_id=business.id` → `updateProject(formData)` → `onOwnerUpdated()`.
- `CreateBusinessModal` sin `clientId` muestra el dropdown de cliente (el usuario elige a qué cliente pertenece la empresa); el flujo actual ya lo soporta.

### 4. ContextOwnerFromCache

- Pasar a `ContextOwnerClient` un callback que invalide cache y recargue: `onOwnerUpdated={loadData}` (donde `loadData` ya invalida y vuelve a cargar proyecto/cliente/business).

### 5. Revalidación

- `updateProject` ya hace `revalidatePath('/dashboard')`, `revalidatePath('/project')`. Opcional: añadir `revalidatePath('/context')` o la ruta del contexto si se desea; la invalidación del cache en cliente es suficiente para que la pestaña Owner se actualice.

## Archivos a tocar

| Archivo                                                   | Cambio                                                                                                                 |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `app/clients/components/CreateClientModal.tsx`            | `onCreated?(client?: Client)` y llamar con `result.data`                                                               |
| `app/clients/components/CreateBusinessModal.tsx`          | `onCreated?(business?: Business)` y llamar con `result.data`                                                           |
| `app/context/[projectId]/owner/ContextOwnerClient.tsx`    | Empty state: botones Agregar cliente/empresa, modales, `updateProject` + `onOwnerUpdated`; quitar Link Editar Proyecto |
| `app/context/[projectId]/owner/ContextOwnerFromCache.tsx` | Pasar `onOwnerUpdated={loadData}` a ContextOwnerClient                                                                 |

## Resumen UX

- Usuario en **Responsable del proyecto** sin cliente ni empresa → ve el mismo bloque actual con el texto "Vincula un cliente y/o empresa…" y **dos botones**: "Agregar cliente" y "Agregar empresa".
- Clic en **Agregar cliente** → modal existente de nuevo cliente → al guardar, se vincula al proyecto y la vista se actualiza (aparece la ficha del cliente).
- Clic en **Agregar empresa** → modal existente (con selector de cliente) → al guardar, se vincula la empresa al proyecto y la vista se actualiza.
- Ya no se muestra "Editar Proyecto" que llevaba a la vista Kanban antigua.
