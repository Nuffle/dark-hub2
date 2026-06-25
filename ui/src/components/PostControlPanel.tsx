import { useEffect, useMemo, useState } from "react";
import {
  Timer,
  ChevronRight,
  ChevronLeft,
  Check,
  Plus,
  Trash2,
  RefreshCw,
} from "lucide-react";
import { api, type PostSlot, type Channel } from "@/lib/api";
import { cn } from "@/lib/utils";

function todayStr(): string {
  return new Date().toLocaleDateString("sv-SE"); // AAAA-MM-DD local
}

function countdown(targetTime: string, now: Date): { label: string; tone: "wait" | "late" | "soon" } {
  if (!targetTime || !/^\d{2}:\d{2}$/.test(targetTime)) return { label: "sem horário", tone: "wait" };
  const [h, m] = targetTime.split(":").map(Number);
  const target = new Date(now);
  target.setHours(h, m, 0, 0);
  const diffMs = target.getTime() - now.getTime();
  const abs = Math.abs(diffMs);
  const hrs = Math.floor(abs / 3_600_000);
  const mins = Math.floor((abs % 3_600_000) / 60_000);
  const hm = hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
  if (diffMs < 0) return { label: `atrasado ${hm}`, tone: "late" };
  if (diffMs <= 60 * 60_000) return { label: `falta ${hm}`, tone: "soon" };
  return { label: `falta ${hm}`, tone: "wait" };
}

export function PostControlPanel() {
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem("postpanel.collapsed") === "1",
  );
  const [channels, setChannels] = useState<Channel[]>([]);
  const [slots, setSlots] = useState<PostSlot[]>([]);
  const [now, setNow] = useState(() => new Date());
  const [newTime, setNewTime] = useState<Record<string, string>>({});

  useEffect(() => {
    localStorage.setItem("postpanel.collapsed", collapsed ? "1" : "0");
  }, [collapsed]);

  useEffect(() => {
    refresh();
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  function refresh() {
    Promise.all([api.channels.list(), api.posts.list()])
      .then(([c, s]) => {
        setChannels(c);
        setSlots(s);
      })
      .catch(() => {});
  }

  const slotsByChannel = useMemo(() => {
    const map: Record<string, PostSlot[]> = {};
    for (const s of slots) (map[s.channel_id] ??= []).push(s);
    return map;
  }, [slots]);

  const pendingCount = useMemo(() => {
    const today = todayStr();
    return slots.filter((s) => s.target_time && s.last_posted_date !== today).length;
  }, [slots]);

  async function togglePosted(slot: PostSlot) {
    const next = !slot.posted_today;
    setSlots((prev) =>
      prev.map((s) =>
        s.id === slot.id
          ? { ...s, posted_today: next, last_posted_date: next ? todayStr() : "" }
          : s,
      ),
    );
    await api.posts.setPosted(slot.id, next).catch(refresh);
  }

  async function addSlot(channelId: string) {
    const time = newTime[channelId];
    if (!time) return;
    const created = await api.posts.create(channelId, time).catch(() => null);
    if (created) {
      setSlots((prev) => [...prev, created]);
      setNewTime((prev) => ({ ...prev, [channelId]: "" }));
    }
  }

  async function removeSlot(slot: PostSlot) {
    setSlots((prev) => prev.filter((s) => s.id !== slot.id));
    await api.posts.remove(slot.id).catch(refresh);
  }

  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        className="flex h-full w-12 shrink-0 flex-col items-center gap-3 border-l border-border bg-surface py-4 text-muted hover:text-foreground"
        title="Abrir Controle de Posts"
      >
        <ChevronLeft className="h-4 w-4" />
        <Timer className="h-5 w-5" />
        {pendingCount > 0 && (
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
            {pendingCount}
          </span>
        )}
      </button>
    );
  }

  return (
    <aside className="flex h-full w-72 shrink-0 flex-col border-l border-border bg-surface">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Timer className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">Controle de Posts</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={refresh} title="Atualizar" className="rounded p-1 text-muted hover:text-foreground">
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => setCollapsed(true)} title="Recolher" className="rounded p-1 text-muted hover:text-foreground">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-3">
        {channels.length === 0 ? (
          <div className="px-2 py-6 text-center text-xs text-muted">
            Adicione canais na aba <b className="text-foreground">Canais</b> para
            controlar os posts aqui.
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {channels.map((channel) => {
              const channelSlots = slotsByChannel[channel.id] ?? [];
              return (
                <div key={channel.id} className="flex flex-col gap-2">
                  <div className="truncate text-xs font-semibold text-muted">{channel.name}</div>

                  {channelSlots.map((slot) => {
                    const cd = countdown(slot.target_time, now);
                    return (
                      <div
                        key={slot.id}
                        className={cn(
                          "flex items-center gap-2 rounded-lg border px-2.5 py-2",
                          slot.posted_today
                            ? "border-success/30 bg-success/10"
                            : cd.tone === "late"
                              ? "border-danger/30 bg-danger/10"
                              : "border-border bg-surface-2",
                        )}
                      >
                        <button
                          onClick={() => togglePosted(slot)}
                          title={slot.posted_today ? "Desmarcar" : "Marcar que já postei"}
                          className={cn(
                            "flex h-5 w-5 shrink-0 items-center justify-center rounded border",
                            slot.posted_today
                              ? "border-success bg-success text-white"
                              : "border-border text-transparent hover:border-primary",
                          )}
                        >
                          <Check className="h-3.5 w-3.5" />
                        </button>

                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-semibold tabular-nums">{slot.target_time || "--:--"}</div>
                          <div
                            className={cn(
                              "text-[11px]",
                              slot.posted_today
                                ? "text-success"
                                : cd.tone === "late"
                                  ? "text-danger"
                                  : cd.tone === "soon"
                                    ? "text-warning"
                                    : "text-muted",
                            )}
                          >
                            {slot.posted_today ? "postado hoje" : cd.label}
                          </div>
                        </div>

                        <button
                          onClick={() => removeSlot(slot)}
                          title="Remover horário"
                          className="shrink-0 rounded p-1 text-muted hover:text-danger"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    );
                  })}

                  <div className="flex items-center gap-1.5">
                    <input
                      type="time"
                      value={newTime[channel.id] ?? ""}
                      onChange={(e) => setNewTime((prev) => ({ ...prev, [channel.id]: e.target.value }))}
                      className="flex-1 rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground outline-none focus:border-primary"
                    />
                    <button
                      onClick={() => addSlot(channel.id)}
                      title="Adicionar horário"
                      className="flex items-center gap-1 rounded-md border border-border bg-surface-2 px-2 py-1 text-xs text-muted hover:text-foreground"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
}
