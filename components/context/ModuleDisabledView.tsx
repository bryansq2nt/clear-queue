import { MODULE_REGISTRY, type ModuleKey } from '@/lib/modules/registry';

interface ModuleDisabledViewProps {
  moduleKey: ModuleKey;
  projectId: string;
}

export function ModuleDisabledView({
  moduleKey,
  projectId,
}: ModuleDisabledViewProps) {
  const mod = MODULE_REGISTRY[moduleKey];
  const Icon = mod.icon;

  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 p-8 text-center min-h-[300px]">
      <Icon className="w-12 h-12 text-muted-foreground/30" aria-hidden />
      <div className="max-w-xs">
        <p className="text-sm font-medium text-foreground">
          Este módulo está desactivado para este proyecto
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Puedes activarlo desde los ajustes del proyecto.
        </p>
      </div>
      <a
        href={`/context/${projectId}?settings=modules`}
        className="text-xs text-primary underline-offset-4 hover:underline"
      >
        Abrir ajustes
      </a>
    </div>
  );
}
