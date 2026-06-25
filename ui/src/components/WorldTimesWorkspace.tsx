import { useEffect, useMemo, useState } from "react";
import { Clock, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

type Market = {
  flag: string;
  country: string;
  city: string;
  tz: string;
};

// Principais mercados para canais dark (públicos PT, ES, EN e grandes fusos).
const MARKETS: Market[] = [
  { flag: "🇧🇷", country: "Brasil", city: "São Paulo", tz: "America/Sao_Paulo" },
  { flag: "🇵🇹", country: "Portugal", city: "Lisboa", tz: "Europe/Lisbon" },
  { flag: "🇺🇸", country: "EUA (Leste)", city: "Nova York", tz: "America/New_York" },
  { flag: "🇺🇸", country: "EUA (Oeste)", city: "Los Angeles", tz: "America/Los_Angeles" },
  { flag: "🇲🇽", country: "México", city: "Cidade do México", tz: "America/Mexico_City" },
  { flag: "🇦🇷", country: "Argentina", city: "Buenos Aires", tz: "America/Argentina/Buenos_Aires" },
  { flag: "🇪🇸", country: "Espanha", city: "Madri", tz: "Europe/Madrid" },
  { flag: "🇬🇧", country: "Reino Unido", city: "Londres", tz: "Europe/London" },
  { flag: "🇫🇷", country: "Europa Central", city: "Paris", tz: "Europe/Paris" },
  { flag: "🇮🇳", country: "Índia", city: "Mumbai", tz: "Asia/Kolkata" },
  { flag: "🇯🇵", country: "Japão", city: "Tóquio", tz: "Asia/Tokyo" },
  { flag: "🇦🇺", country: "Austrália", city: "Sydney", tz: "Australia/Sydney" },
];

function offsetHours(tz: string, date: Date): number {
  const utc = new Date(date.toLocaleString("en-US", { timeZone: "UTC" }));
  const local = new Date(date.toLocaleString("en-US", { timeZone: tz }));
  return Math.round(((local.getTime() - utc.getTime()) / 3_600_000) * 10) / 10;
}

function partsFor(tz: string, date: Date) {
  const fmt = new Intl.DateTimeFormat("pt-BR", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
  const hour = Number(parts.hour);
  return {
    time: `${parts.hour}:${parts.minute}`,
    seconds: parts.second,
    date: `${parts.weekday} ${parts.day} ${parts.month}`,
    hour,
  };
}

function windowLabel(hour: number): { label: string; cls: string } | null {
  if (hour >= 18 && hour < 23) return { label: "horário nobre", cls: "bg-success/15 text-success" };
  if (hour >= 12 && hour < 14) return { label: "almoço", cls: "bg-warning/15 text-warning" };
  if (hour >= 0 && hour < 6) return { label: "madrugada", cls: "bg-muted/15 text-muted" };
  return null;
}

export function WorldTimesWorkspace() {
  const [now, setNow] = useState(() => new Date());
  const [simTime, setSimTime] = useState<string>(""); // "HH:MM" ou vazio = ao vivo

  useEffect(() => {
    if (simTime) return; // congelado no modo simulação
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, [simTime]);

  // Instante de referência: agora, ou hoje no horário simulado (no fuso local).
  const baseDate = useMemo(() => {
    if (!simTime) return now;
    const [h, m] = simTime.split(":").map(Number);
    const d = new Date();
    d.setHours(h, m, 0, 0);
    return d;
  }, [simTime, now]);

  const userTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const userOffset = offsetHours(userTz, baseDate);
  const userParts = partsFor(userTz, baseDate);

  return (
    <div className="flex h-full flex-col gap-4 overflow-auto">
      {/* Barra: seu horário + simulador */}
      <div className="flex flex-wrap items-center gap-4 rounded-lg border border-border bg-surface p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <Clock className="h-5 w-5" />
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-muted">seu horário</div>
            <div className="text-xl font-bold tabular-nums">
              {userParts.time}
              {!simTime && <span className="text-sm text-muted">:{userParts.seconds}</span>}
            </div>
            <div className="text-[11px] text-muted">{userTz}</div>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <label className="text-xs text-muted">simular postagem às</label>
          <input
            type="time"
            value={simTime}
            onChange={(e) => setSimTime(e.target.value)}
            className="rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground outline-none focus:border-primary"
          />
          {simTime && (
            <button
              onClick={() => setSimTime("")}
              title="Voltar para o horário atual"
              className="flex items-center gap-1 rounded-md border border-border bg-surface-2 px-2 py-1.5 text-xs text-muted hover:text-foreground"
            >
              <RotateCcw className="h-3.5 w-3.5" /> agora
            </button>
          )}
        </div>
      </div>

      {simTime && (
        <div className="rounded-lg border border-primary/30 bg-primary/10 px-4 py-2 text-sm text-foreground">
          Simulando: se você postar <b>hoje às {simTime}</b> no seu horário, abaixo é a hora em cada mercado.
        </div>
      )}

      {/* Grade de mercados */}
      <div className="grid grid-cols-1 gap-3 pb-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {MARKETS.map((m) => {
          const p = partsFor(m.tz, baseDate);
          const diff = Math.round((offsetHours(m.tz, baseDate) - userOffset) * 10) / 10;
          const diffLabel = diff === 0 ? "mesmo horário" : `${diff > 0 ? "+" : ""}${diff}h`;
          const win = windowLabel(p.hour);
          const night = p.hour < 6 || p.hour >= 20;
          return (
            <div key={m.tz} className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xl">{m.flag}</span>
                  <div>
                    <div className="text-sm font-medium leading-tight">{m.country}</div>
                    <div className="text-[11px] text-muted">{m.city}</div>
                  </div>
                </div>
                <span className="text-lg" title={night ? "noite" : "dia"}>
                  {night ? "🌙" : "☀️"}
                </span>
              </div>

              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold tabular-nums">{p.time}</span>
                {!simTime && <span className="text-xs text-muted tabular-nums">:{p.seconds}</span>}
              </div>

              <div className="flex items-center justify-between">
                <span className="text-[11px] text-muted">{p.date}</span>
                <span
                  className={cn(
                    "rounded px-1.5 py-0.5 text-[11px] font-medium",
                    diff === 0 ? "bg-surface-2 text-muted" : "bg-surface-2 text-foreground",
                  )}
                >
                  {diffLabel}
                </span>
              </div>

              {win && (
                <span className={cn("self-start rounded px-2 py-0.5 text-[11px] font-medium", win.cls)}>
                  {win.label}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
