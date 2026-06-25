import { cn } from "@/lib/utils";
import { MODULES, type ModuleId } from "@/modules";

type SidebarProps = {
  active: ModuleId;
  onSelect: (id: ModuleId) => void;
};

export function Sidebar({ active, onSelect }: SidebarProps) {
  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r border-border bg-surface">
      <div className="flex items-center gap-2 px-5 py-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold">
          D
        </div>
        <div>
          <div className="text-sm font-semibold leading-tight">Dark Hub</div>
          <div className="text-[11px] text-muted">central de canais</div>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-1 px-3">
        {MODULES.map((mod) => {
          const Icon = mod.icon;
          const isActive = mod.id === active;
          return (
            <button
              key={mod.id}
              onClick={() => onSelect(mod.id)}
              className={cn(
                "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors",
                isActive
                  ? "bg-surface-2 text-foreground"
                  : "text-muted hover:bg-surface-2/60 hover:text-foreground",
              )}
            >
              <Icon
                className={cn(
                  "h-[18px] w-[18px] shrink-0",
                  isActive ? "text-primary" : "text-muted group-hover:text-foreground",
                )}
              />
              <span className="text-sm font-medium">{mod.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="px-5 py-4 text-[11px] text-muted">v0.1 · Fase 0</div>
    </aside>
  );
}
