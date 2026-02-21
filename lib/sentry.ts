/**
 * Helper para reportar errores a Sentry con contexto estructurado.
 * Ver docs/plans/plan-sentry-error-context.md y docs/reference/sentry-guide.md.
 */

import * as Sentry from '@sentry/nextjs';

/** Opciones de contexto al reportar un error. */
export interface SentryErrorContext {
  /** Módulo o área donde ocurrió (ej. "board", "tasks", "auth", "budgets"). */
  module: string;
  /** Operación que se ejecutaba (ej. "moveTask", "createProject", "updateNote"). */
  action: string;
  /** Qué intentaba hacer el usuario en lenguaje de negocio (ej. "Mover tarea a En progreso"). */
  userIntent?: string;
  /** Comportamiento esperado en una frase (ej. "La tarea se actualiza y la columna se re-renderiza"). */
  expected?: string;
  /** ID del usuario afectado; se usa para setUser en este evento. */
  userId?: string;
  /** Datos adicionales sin estructura fija (projectId, taskId, etc.). No incluir datos sensibles. */
  extra?: Record<string, unknown>;
}

/**
 * Reporta un error a Sentry con contexto estructurado (módulo, acción, intención, esperado, sucedido).
 * Usar en catch de server actions, rutas API y manejadores de error en cliente.
 *
 * @param error - Excepción capturada (Error o valor lanzado).
 * @param context - module y action obligatorios; userIntent, expected, userId y extra opcionales.
 *
 * @example
 * try {
 *   await updateTaskOrder(...);
 * } catch (err) {
 *   captureWithContext(err, {
 *     module: 'board',
 *     action: 'updateTaskOrder',
 *     userIntent: 'Mover tarea a En progreso',
 *     expected: 'La tarea cambia de columna y el orden se persiste',
 *     extra: { projectId, taskId },
 *   });
 *   return { error: '...' };
 * }
 */
export function captureWithContext(
  error: unknown,
  context: SentryErrorContext
): void {
  const { module, action, userIntent, expected, userId, extra = {} } = context;
  const actual = error instanceof Error ? error.message : String(error);

  Sentry.withScope((scope) => {
    scope.setTag('module', module);
    scope.setTag('action', action);
    if (userId) {
      scope.setUser({ id: userId });
    }
    scope.setContext('error_context', {
      userIntent: userIntent ?? undefined,
      expected: expected ?? undefined,
      actual,
      ...extra,
    });
    Sentry.captureException(error);
  });
}
