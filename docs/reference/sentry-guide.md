# Guía de Sentry en el proyecto

## ¿Qué es Sentry?

**Sentry** es un servicio de **monitoreo de errores y rendimiento** para aplicaciones. En la práctica:

- **Captura excepciones** que ocurren en el navegador (cliente) y en el servidor (Node/Next.js) y las envía a un dashboard.
- **Rastrea rendimiento** (tiempos de carga, transacciones, spans) para ver cuellos de botella.
- **Session Replay** (opcional): graba sesiones de usuario cuando hay un error, para reproducir el fallo.

Así puedes ver en **sentry.io** qué falló, en qué archivo/línea, con qué usuario y contexto, sin depender solo de “me dijeron que se rompió”.

---

## ¿Para qué sirve?

| Uso                       | Descripción                                                                                                                     |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **Errores en producción** | Errores no capturados (y los que tú envías con `captureException`) llegan al dashboard con stack trace, breadcrumbs y contexto. |
| **Rendimiento**           | Ver qué rutas o APIs son lentas (traces, spans).                                                                                |
| **Priorizar fixes**       | Saber qué error afecta a más usuarios o se repite más.                                                                          |
| **Debugging**             | Breadcrumbs (clicks, navegación, fetches) y, si usas Replay, ver qué hizo el usuario antes del error.                           |

---

## Cómo está configurado en este proyecto

- **Paquete:** `@sentry/nextjs` en **dependencies** (debe estar en producción para que se envíen errores).
- **Configuración por entorno:**
  - **Servidor (Node):** `sentry.server.config.ts`
  - **Edge (middleware, etc.):** `sentry.edge.config.ts`
  - **Cliente (navegador):** `instrumentation-client.ts`
- **Inicialización:** Next.js carga Sentry vía `instrumentation.ts` (servidor/edge) e `instrumentation-client.ts` (cliente). Si no hay `NEXT_PUBLIC_SENTRY_DSN`, Sentry no se inicializa (no se envían eventos).
- **Errores no capturados:** Se envían automáticamente cuando el DSN está configurado. Los errores que “rompen” la app se capturan en `app/global-error.tsx` con `Sentry.captureException(error)`.
- **Rendimiento:** `onRouterTransitionStart` en cliente; `tracesSampleRate` configurable por env (por defecto 1; en producción conviene bajar a 0.1–0.2).
- **Replay:** Habilitado en cliente; `replaysSessionSampleRate` por env (por defecto 0.1).

### Variables de entorno

| Variable                                        | Dónde           | Descripción                                                                                                  |
| ----------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------ |
| `NEXT_PUBLIC_SENTRY_DSN`                        | Todas           | DSN del proyecto en Sentry. Si no está definida, Sentry no se inicializa. **Obligatoria** para que funcione. |
| `SENTRY_TRACES_SAMPLE_RATE`                     | Servidor / Edge | Porcentaje de transacciones de rendimiento (0–1). Por defecto 1. En producción suele ponerse 0.1.            |
| `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE`         | Cliente         | Igual para el cliente.                                                                                       |
| `NEXT_PUBLIC_SENTRY_REPLAY_SESSION_SAMPLE_RATE` | Cliente         | Porcentaje de sesiones con Replay (0–1). Por defecto 0.1.                                                    |
| `SENTRY_SEND_DEFAULT_PII`                       | Servidor / Edge | Si es `false`, no se envían IP ni datos por defecto. Por defecto se envían.                                  |
| `NEXT_PUBLIC_SENTRY_SEND_DEFAULT_PII`           | Cliente         | Igual para el cliente.                                                                                       |

Ejemplo en `.env.local` (no subir a git):

```bash
NEXT_PUBLIC_SENTRY_DSN=https://xxx@oxxx.ingest.us.sentry.io/xxx
# Opcional en producción para ahorrar cuota:
# SENTRY_TRACES_SAMPLE_RATE=0.1
# NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE=0.1
# NEXT_PUBLIC_SENTRY_REPLAY_SESSION_SAMPLE_RATE=0.05
```

---

## Cómo usarlo en el código

### Reportar con contexto estructurado (recomendado)

Para que cada error en Sentry permita ver **en qué módulo ocurrió**, **qué intentaba el usuario**, **qué se esperaba** y **qué sucedió**, usa el helper `captureWithContext` de `@/lib/sentry`:

```ts
import { captureWithContext } from '@/lib/sentry';

try {
  await updateTaskOrder(...);
} catch (err) {
  captureWithContext(err, {
    module: 'board',
    action: 'updateTaskOrder',
    userIntent: 'Mover tarea a En progreso',
    expected: 'La tarea cambia de columna y el orden se persiste',
    extra: { projectId, taskId },
  });
  return { error: '...' };
}
```

**Campos del contexto:**

| Campo        | Obligatorio | Descripción                                                                                   |
| ------------ | ----------- | --------------------------------------------------------------------------------------------- |
| `module`     | Sí          | Módulo o área (ej. `board`, `tasks`, `auth`, `budgets`, `ideas`). Aparece como tag en Sentry. |
| `action`     | Sí          | Operación que se ejecutaba (ej. `moveTask`, `createProject`, `updateNote`). Tag en Sentry.    |
| `userIntent` | No          | Qué intentaba hacer el usuario en lenguaje de negocio. Context en el evento.                  |
| `expected`   | No          | Comportamiento esperado en una frase. Context en el evento.                                   |
| `userId`     | No          | ID del usuario afectado; se asocia al evento para filtrar por usuario.                        |
| `extra`      | No          | Objeto con datos adicionales (ej. `projectId`, `taskId`). No incluir datos sensibles.         |

El campo **actual** (qué sucedió) se rellena automáticamente con el mensaje del error.  
Plan completo: [docs/plans/plan-sentry-error-context.md](../plans/plan-sentry-error-context.md).

---

### 1. No hacer nada (errores no capturados)

Cualquier `throw new Error(...)` o rechazo de promesa no manejado que llegue al runtime de Next/React se envía a Sentry si la inicialización está activa. No necesitas llamar a Sentry a mano para esos casos.

### 2. Enviar errores que sí manejas (try/catch o catch de promesa)

Cuando capturas un error y quieres registrarlo en Sentry, **preferir `captureWithContext`** (ver sección anterior). Si no necesitas contexto estructurado, puedes usar la API directa:

```ts
import * as Sentry from '@sentry/nextjs';

try {
  await algunaAccion();
} catch (err) {
  Sentry.captureException(err);
  Sentry.setContext('accion', { projectId, step: 'updateTask' });
  throw err;
}
```

### 3. Mensajes y breadcrumbs

- **Mensaje genérico (sin excepción):**  
  `Sentry.captureMessage('Algo raro pasó', 'warning');`
- **Breadcrumb (pasos antes del error):**  
  `Sentry.addBreadcrumb({ category: 'auth', message: 'Intentando login', level: 'info' });`

Los breadcrumbs se adjuntan al siguiente evento de error y ayudan a entender el flujo del usuario.

### 4. Identificar al usuario (opcional)

Si el usuario está logueado, puedes setear su id/email para ver en Sentry qué usuario tuvo el error:

```ts
import * as Sentry from '@sentry/nextjs';

Sentry.setUser({ id: user.id, email: user.email ?? undefined });
```

Conviene hacerlo al cargar la sesión (por ejemplo en un layout o provider). Si envías PII (email), revisa la política de privacidad y la opción `sendDefaultPii`.

### 5. Rendimiento (spans manuales)

Para medir una operación concreta:

```ts
await Sentry.startSpan({ name: 'loadProjectBoard', op: 'task' }, async () => {
  // tu lógica
});
```

Esto crea un span en la transacción actual y lo verás en “Performance” en Sentry.

---

## Página de ejemplo

Existe una ruta de prueba:

- **Página:** `app/sentry-example-page/page.tsx`
- **API:** `app/api/sentry-example-api/route.ts`

Esa página lanza un error de ejemplo y tiene un botón para comprobar conectividad con Sentry. Úsala solo en desarrollo o en un entorno de staging; en producción suele eliminarse o protegerse por rol.

---

## Buenas prácticas

1. **No loguear datos sensibles** (contraseñas, tokens) en mensajes, context ni user. Revisa `sendDefaultPii` si envías email/nombre.
2. **DSN y opciones en env:** El DSN y, si quieres, sample rates y PII se configuran con las variables de la tabla anterior.
3. **Reducir sample rates en producción:** `tracesSampleRate` y `replaysSessionSampleRate` a 0.1 (o menos) para no pasarte de cuota.
4. **Tags útiles:** Añadir `tags: { area: 'board', action: 'moveTask' }` en `captureException` para filtrar en el dashboard.
5. **Página de ejemplo:** En producción considera eliminar o proteger `app/sentry-example-page` y `app/api/sentry-example-api` para que no cualquiera dispare errores de prueba en tu proyecto de Sentry.

---

## Resumen

- **Sentry** = monitoreo de errores y rendimiento en tiempo real.
- En este proyecto está integrado con **DSN y opciones por variables de entorno**; si no defines `NEXT_PUBLIC_SENTRY_DSN`, Sentry no se inicializa.
- Para usarlo: define `NEXT_PUBLIC_SENTRY_DSN` en tu entorno (p. ej. `.env.local` y en tu hosting), abre el proyecto en [sentry.io](https://sentry.io) y revisa Issues y Performance.

Documentación oficial: [Sentry for Next.js](https://docs.sentry.io/platforms/javascript/guides/nextjs/).
