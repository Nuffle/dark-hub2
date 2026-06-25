import { useEffect, useMemo, useState } from "react";
import { Clock, Plus, RotateCcw, Star, X } from "lucide-react";
import { cn } from "@/lib/utils";

type Market = {
  flag: string;
  country: string;
  city: string;
  tz: string;
  custom?: boolean;
};

type SortMode = "offset" | "name";

const STORAGE_KEYS = {
  pinned: "worldtimes.pinned",
  custom: "worldtimes.custom",
} as const;

const HOME_TZ = "America/Sao_Paulo";

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

const EXTRA_TIMEZONES: Market[] = [
  { flag: "🇳🇬", country: "Nigéria", city: "Lagos", tz: "Africa/Lagos" },
  { flag: "🇪🇬", country: "Egito", city: "Cairo", tz: "Africa/Cairo" },
  { flag: "🇿🇦", country: "África do Sul", city: "Joanesburgo", tz: "Africa/Johannesburg" },
  { flag: "🇰🇪", country: "Quênia", city: "Nairóbi", tz: "Africa/Nairobi" },
  { flag: "🇦🇪", country: "Emirados", city: "Dubai", tz: "Asia/Dubai" },
  { flag: "🇸🇦", country: "Arábia Saudita", city: "Riad", tz: "Asia/Riyadh" },
  { flag: "🇹🇷", country: "Turquia", city: "Istambul", tz: "Europe/Istanbul" },
  { flag: "🇨🇳", country: "China", city: "Pequim", tz: "Asia/Shanghai" },
  { flag: "🇰🇷", country: "Coreia do Sul", city: "Seul", tz: "Asia/Seoul" },
  { flag: "🇮🇩", country: "Indonésia", city: "Jacarta", tz: "Asia/Jakarta" },
  { flag: "🇸🇬", country: "Singapura", city: "Singapura", tz: "Asia/Singapore" },
  { flag: "🇵🇭", country: "Filipinas", city: "Manila", tz: "Asia/Manila" },
  { flag: "🇹🇭", country: "Tailândia", city: "Bangkok", tz: "Asia/Bangkok" },
  { flag: "🇻🇳", country: "Vietnã", city: "Ho Chi Minh", tz: "Asia/Ho_Chi_Minh" },
  { flag: "🇷🇺", country: "Rússia", city: "Moscou", tz: "Europe/Moscow" },
  { flag: "🇮🇹", country: "Itália", city: "Roma", tz: "Europe/Rome" },
  { flag: "🇩🇪", country: "Alemanha", city: "Berlim", tz: "Europe/Berlin" },
  { flag: "🇳🇱", country: "Holanda", city: "Amsterdã", tz: "Europe/Amsterdam" },
  { flag: "🇸🇪", country: "Suécia", city: "Estocolmo", tz: "Europe/Stockholm" },
  { flag: "🇨🇦", country: "Canadá (Leste)", city: "Toronto", tz: "America/Toronto" },
  { flag: "🇨🇦", country: "Canadá (Oeste)", city: "Vancouver", tz: "America/Vancouver" },
  { flag: "🇨🇱", country: "Chile", city: "Santiago", tz: "America/Santiago" },
  { flag: "🇨🇴", country: "Colômbia", city: "Bogotá", tz: "America/Bogota" },
  { flag: "🇵🇪", country: "Peru", city: "Lima", tz: "America/Lima" },
  { flag: "🇻🇪", country: "Venezuela", city: "Caracas", tz: "America/Caracas" },
  { flag: "🇺🇾", country: "Uruguai", city: "Montevidéu", tz: "America/Montevideo" },
  { flag: "🇳🇿", country: "Nova Zelândia", city: "Auckland", tz: "Pacific/Auckland" },
  { flag: "🇮🇱", country: "Israel", city: "Tel Aviv", tz: "Asia/Jerusalem" },
  { flag: "🇲🇾", country: "Malásia", city: "Kuala Lumpur", tz: "Asia/Kuala_Lumpur" },
  { flag: "🇵🇱", country: "Polônia", city: "Varsóvia", tz: "Europe/Warsaw" },
];

function readPinned(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEYS.pinned) || "[]");
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function isMarket(value: unknown): value is Market {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.flag === "string" &&
    typeof item.country === "string" &&
    typeof item.city === "string" &&
    typeof item.tz === "string"
  );
}

function readCustomMarkets(): Market[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEYS.custom) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isMarket).map((market) => ({ ...market, custom: true }));
  } catch {
    return [];
  }
}

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
  const [sortMode, setSortMode] = useState<SortMode>("offset");
  const [pinned, setPinned] = useState<string[]>(readPinned);
  const [customMarkets, setCustomMarkets] = useState<Market[]>(readCustomMarkets);
  const [addingMarket, setAddingMarket] = useState(false);
  const [selectedExtra, setSelectedExtra] = useState(EXTRA_TIMEZONES[0]?.tz ?? "");

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.pinned, JSON.stringify(pinned));
  }, [pinned]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.custom, JSON.stringify(customMarkets));
  }, [customMarkets]);

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

  const markets = useMemo(() => {
    const byTz = new Map<string, Market>();
    for (const market of MARKETS) byTz.set(market.tz, market);
    for (const market of customMarkets) {
      if (!byTz.has(market.tz)) byTz.set(market.tz, { ...market, custom: true });
    }
    return Array.from(byTz.values());
  }, [customMarkets]);

  const availableExtras = useMemo(
    () => EXTRA_TIMEZONES.filter((market) => !markets.some((item) => item.tz === market.tz)),
    [markets],
  );

  const sortedMarkets = useMemo(() => {
    const pinnedSet = new Set(pinned);
    const compare = (a: Market, b: Market) => {
      if (sortMode === "name") {
        return `${a.country} ${a.city}`.localeCompare(`${b.country} ${b.city}`, "pt-BR");
      }
      const diff = offsetHours(a.tz, baseDate) - offsetHours(b.tz, baseDate);
      return diff || `${a.country} ${a.city}`.localeCompare(`${b.country} ${b.city}`, "pt-BR");
    };
    return [...markets].sort((a, b) => {
      const homeDiff = Number(b.tz === HOME_TZ) - Number(a.tz === HOME_TZ);
      if (homeDiff) return homeDiff;
      const pinnedDiff = Number(pinnedSet.has(b.tz)) - Number(pinnedSet.has(a.tz));
      return pinnedDiff || compare(a, b);
    });
  }, [baseDate, markets, pinned, sortMode]);

  function togglePinned(tz: string) {
    setPinned((current) =>
      current.includes(tz) ? current.filter((item) => item !== tz) : [...current, tz],
    );
  }

  function addCustomMarket() {
    const market = availableExtras.find((item) => item.tz === selectedExtra) ?? availableExtras[0];
    if (!market) return;
    setCustomMarkets((current) => [...current, { ...market, custom: true }]);
    setAddingMarket(false);
    setSelectedExtra(availableExtras.find((item) => item.tz !== market.tz)?.tz ?? "");
  }

  function removeCustomMarket(tz: string) {
    setCustomMarkets((current) => current.filter((market) => market.tz !== tz));
    setPinned((current) => current.filter((item) => item !== tz));
  }

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

        <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
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

          <select
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as SortMode)}
            className="rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground outline-none focus:border-primary"
          >
            <option value="offset">Por fuso</option>
            <option value="name">Por nome</option>
          </select>

          <button
            onClick={() => setAddingMarket((value) => !value)}
            className="flex items-center gap-1 rounded-md border border-border bg-surface-2 px-2 py-1.5 text-xs text-muted hover:text-foreground"
          >
            <Plus className="h-3.5 w-3.5" /> mercado
          </button>
        </div>
      </div>

      {addingMarket && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface px-4 py-3">
          <label className="text-xs text-muted">adicionar mercado</label>
          <select
            value={selectedExtra}
            onChange={(e) => setSelectedExtra(e.target.value)}
            disabled={availableExtras.length === 0}
            className="min-w-64 rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground outline-none focus:border-primary disabled:opacity-50"
          >
            {availableExtras.length === 0 ? (
              <option value="">Todos os extras já foram adicionados</option>
            ) : (
              availableExtras.map((market) => (
                <option key={market.tz} value={market.tz}>
                  {market.flag} {market.country} — {market.city}
                </option>
              ))
            )}
          </select>
          <button
            onClick={addCustomMarket}
            disabled={availableExtras.length === 0}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            Adicionar
          </button>
          <button
            onClick={() => setAddingMarket(false)}
            title="Fechar"
            className="rounded-md border border-border bg-surface-2 p-1.5 text-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {simTime && (
        <div className="rounded-lg border border-primary/30 bg-primary/10 px-4 py-2 text-sm text-foreground">
          Simulando: se você postar <b>hoje às {simTime}</b> no seu horário, abaixo é a hora em cada mercado.
        </div>
      )}

      {/* Grade de mercados */}
      <div className="grid grid-cols-1 gap-3 pb-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {sortedMarkets.map((market) => {
          const p = partsFor(market.tz, baseDate);
          const diff = Math.round((offsetHours(market.tz, baseDate) - userOffset) * 10) / 10;
          const diffLabel = diff === 0 ? "mesmo horário" : `${diff > 0 ? "+" : ""}${diff}h`;
          const win = windowLabel(p.hour);
          const night = p.hour < 6 || p.hour >= 20;
          const isPinned = pinned.includes(market.tz);
          const isHome = market.tz === HOME_TZ;
          return (
            <div
              key={market.tz}
              className={cn(
                "flex flex-col gap-2 rounded-lg border bg-surface p-4",
                isHome ? "border-primary/70 ring-1 ring-inset ring-primary/50" : "border-border",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="text-xl">{market.flag}</span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-medium leading-tight">{market.country}</span>
                      {isHome && (
                        <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                          você
                        </span>
                      )}
                    </div>
                    <div className="truncate text-[11px] text-muted">{market.city}</div>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {!isHome && (
                    <button
                      onClick={() => togglePinned(market.tz)}
                      title={isPinned ? "Desafixar mercado" : "Fixar mercado"}
                      className={cn(
                        "rounded p-1 hover:bg-surface-2",
                        isPinned ? "text-warning" : "text-muted hover:text-foreground",
                      )}
                    >
                      <Star className={cn("h-4 w-4", isPinned && "fill-warning")} />
                    </button>
                  )}
                  {market.custom && (
                    <button
                      onClick={() => removeCustomMarket(market.tz)}
                      title="Remover mercado"
                      className="rounded p-1 text-muted hover:bg-surface-2 hover:text-danger"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                  <span className="px-1 text-lg" title={night ? "noite" : "dia"}>
                    {night ? "🌙" : "☀️"}
                  </span>
                </div>
              </div>

              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold tabular-nums">{p.time}</span>
                {!simTime && <span className="text-xs text-muted tabular-nums">:{p.seconds}</span>}
              </div>

              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-[11px] text-muted">{p.date}</span>
                <span
                  className={cn(
                    "rounded px-1.5 py-0.5 text-[11px] font-medium",
                    diff === 0 ? "bg-surface-2 text-muted" : "bg-surface-2 text-foreground",
                  )}
                >
                  {diffLabel}
                </span>
              </div>

              <div className="flex min-h-5 items-center gap-1.5">
                {win && (
                  <span className={cn("rounded px-2 py-0.5 text-[11px] font-medium", win.cls)}>
                    {win.label}
                  </span>
                )}
                {market.custom && (
                  <span className="rounded bg-surface-2 px-2 py-0.5 text-[11px] text-muted">
                    personalizado
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
