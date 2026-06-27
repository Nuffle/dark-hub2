import { useEffect, useState } from "react";
import { Sidebar } from "@/components/Sidebar";
import { RadarWorkspace } from "@/components/radar/RadarWorkspace";
import { BackupWorkspace } from "@/components/BackupWorkspace";
import { WorldTimesWorkspace } from "@/components/WorldTimesWorkspace";
import { ChannelsWorkspace } from "@/components/ChannelsWorkspace";
import { NotesWorkspace } from "@/components/NotesWorkspace";
import { SoundsWorkspace } from "@/components/SoundsWorkspace";
import { PostControlPanel } from "@/components/PostControlPanel";
import { UpdateBanner } from "@/components/UpdateBanner";
import { MODULES, type ModuleId } from "@/modules";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

type MotorState =
  | { status: "loading" }
  | { status: "online"; version: string }
  | { status: "offline" };

function MotorBadge({ state }: { state: MotorState }) {
  const map = {
    loading: { label: "conectando ao motor…", color: "bg-warning" },
    online: { label: "motor online", color: "bg-success" },
    offline: { label: "motor offline", color: "bg-danger" },
  } as const;
  const info = map[state.status];
  return (
    <div className="flex items-center gap-2 text-xs text-muted">
      <span className={cn("h-2 w-2 rounded-full", info.color)} />
      <span>
        {info.label}
        {state.status === "online" ? ` · v${state.version}` : ""}
      </span>
    </div>
  );
}

export default function App() {
  const [active, setActive] = useState<ModuleId>("radar");
  const [motor, setMotor] = useState<MotorState>({ status: "loading" });

  useEffect(() => {
    let alive = true;
    const ping = () =>
      api
        .health()
        .then((h) => alive && setMotor({ status: "online", version: h.version }))
        .catch(() => alive && setMotor({ status: "offline" }));
    ping();
    const id = setInterval(ping, 5000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const current = MODULES.find((m) => m.id === active)!;

  return (
    <div className="flex h-full w-full flex-col bg-background text-foreground">
      <UpdateBanner />
      <div className="flex min-h-0 flex-1">
      <Sidebar active={active} onSelect={setActive} />

      <main className="flex flex-1 flex-col overflow-hidden">
        <header className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <h1 className="text-lg font-semibold">{current.label}</h1>
            <p className="text-sm text-muted">{current.description}</p>
          </div>
          <MotorBadge state={motor} />
        </header>

        {/* Abas ficam montadas e só escondemos as inativas — assim o estado
            (resultados do Radar, etc.) NÃO se perde ao trocar de aba. */}
        <section className="flex-1 overflow-hidden p-6">
          <div className={cn("h-full", active !== "radar" && "hidden")}>
            <RadarWorkspace />
          </div>
          <div className={cn("h-full", active !== "canais" && "hidden")}>
            <ChannelsWorkspace />
          </div>
          <div className={cn("h-full", active !== "sons" && "hidden")}>
            <SoundsWorkspace />
          </div>
          <div className={cn("h-full", active !== "anotacoes" && "hidden")}>
            <NotesWorkspace />
          </div>
          <div className={cn("h-full", active !== "horarios" && "hidden")}>
            <WorldTimesWorkspace />
          </div>
          <div className={cn("h-full", active !== "nuvem" && "hidden")}>
            <BackupWorkspace />
          </div>
        </section>
      </main>

      <PostControlPanel />
      </div>
    </div>
  );
}
