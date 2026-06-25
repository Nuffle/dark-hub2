import { useEffect, useMemo, useState } from "react";
import {
  Timer,
  ChevronRight,
  ChevronLeft,
  Check,
  Plus,
  Trash2,
  RefreshCw,
  CalendarClock,
} from "lucide-react";
import {
  api,
  type Channel,
  type PostSettings,
  type PostSettingsInput,
  type PostSlot,
} from "@/lib/api";
import { cn } from "@/lib/utils";

function todayStr(): string {
  return new Date().toLocaleDateString("sv-SE");
}

function countdown(targetTime: string, now: Date): { label: string; tone: "wait" | "late" } {
  if (!targetTime || !/^\d{2}:\d{2}$/.test(targetTime)) {
    return { label: "sem horário", tone: "wait" };
  }
  const [h, m] = targetTime.split(":").map(Number);
  const target = new Date(now);
  target.setHours(h, m, 0, 0);
  const diffMs = target.getTime() - now.getTime();
  const abs = Math.abs(diffMs);
  const hrs = Math.floor(abs / 3_600_000);
  const mins = Math.floor((abs % 3_600_000) / 60_000);
  const hm = hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
  if (diffMs < 0) return { label: `Atrasado ${hm}`, tone: "late" };
  return { label: `Falta ${hm}`, tone: "wait" };
}

function defaultYoutubeScheduleUrl(channel: Channel): string {
  return channel.channel_id
    ? `https://studio.youtube.com/channel/${channel.channel_id}/analytics/tab-build_audience/period-default`
    : "https://studio.youtube.com";
}

function draftFromSettings(settings?: PostSettings): PostSettingsInput {
  return {
    first_time: settings?.first_time || "",
    interval_hours: settings?.interval_hours || 6,
    use_yt_schedule: settings?.use_yt_schedule || false,
    yt_schedule_url: settings?.yt_schedule_url || "",
  };
}

function sameDraft(a: PostSettingsInput, b: PostSettingsInput): boolean {
  return (
    a.first_time === b.first_time &&
    Number(a.interval_hours) === Number(b.interval_hours) &&
    a.use_yt_schedule === b.use_yt_schedule &&
    a.yt_schedule_url.trim() === b.yt_schedule_url.trim()
  );
}

/** Interruptor compacto reutilizável. */
function Switch({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      role="switch"
      aria-checked={on}
      className={cn(
        "relative h-4 w-7 shrink-0 rounded-full transition-colors",
        on ? "bg-primary" : "border border-border bg-surface-2",
      )}
    >
      <span
        className={cn(
          "absolute left-0.5 top-0.5 h-3 w-3 rounded-full bg-white transition-transform",
          on ? "translate-x-3" : "translate-x-0",
        )}
      />
    </button>
  );
}

export function PostControlPanel() {
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem("postpanel.collapsed") === "1",
  );
  const [channels, setChannels] = useState<Channel[]>([]);
  const [slots, setSlots] = useState<PostSlot[]>([]);
  const [settings, setSettings] = useState<Record<string, PostSettings>>({});
  const [drafts, setDrafts] = useState<Record<string, PostSettingsInput>>({});
  const [now, setNow] = useState(() => new Date());
  const [newTime, setNewTime] = useState<Record<string, string>>({});
  const [savingChannel, setSavingChannel] = useState<string | null>(null);

  useEffect(() => {
    localStorage.setItem("postpanel.collapsed", collapsed ? "1" : "0");
  }, [collapsed]);

  useEffect(() => {
    refresh();
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  function refresh() {
    Promise.all([api.channels.list(), api.posts.list(), api.posts.settings()])
      .then(([c, s, postSettings]) => {
        const settingsMap = Object.fromEntries(postSettings.map((item) => [item.channel_id, item]));
        setChannels(c);
        setSlots(s);
        setSettings(settingsMap);
        setDrafts((current) => {
          const next = { ...current };
          for (const channel of c) {
            next[channel.id] = next[channel.id] ?? draftFromSettings(settingsMap[channel.id]);
          }
          return next;
        });
      })
      .catch(() => {});
  }

  const slotsByChannel = useMemo(() => {
    const map: Record<string, PostSlot[]> = {};
    for (const slot of slots) (map[slot.channel_id] ??= []).push(slot);
    for (const list of Object.values(map)) {
      list.sort((a, b) => a.sequence_index - b.sequence_index || a.target_time.localeCompare(b.target_time));
    }
    return map;
  }, [slots]);

  const pendingCount = useMemo(() => {
    const today = todayStr();
    return slots.filter((slot) => {
      if (settings[slot.channel_id]?.use_yt_schedule) return false;
      return slot.target_time && slot.last_posted_date !== today;
    }).length;
  }, [slots, settings]);

  function updateDraft(channelId: string, patch: Partial<PostSettingsInput>) {
    setDrafts((current) => ({
      ...current,
      [channelId]: { ...draftFromSettings(settings[channelId]), ...current[channelId], ...patch },
    }));
  }

  async function saveSettings(channel: Channel) {
    const draft = drafts[channel.id] ?? draftFromSettings(settings[channel.id]);
    const payload = {
      ...draft,
      yt_schedule_url: channel.yt_schedule_url.trim() || defaultYoutubeScheduleUrl(channel),
    };
    setSavingChannel(channel.id);
    try {
      const result = await api.posts.updateSettings(channel.id, payload);
      setSettings((current) => ({ ...current, [channel.id]: result.settings }));
      setDrafts((current) => ({ ...current, [channel.id]: draftFromSettings(result.settings) }));
      setSlots(result.slots);
    } catch {
      refresh();
    } finally {
      setSavingChannel(null);
    }
  }

  async function togglePosted(slot: PostSlot) {
    const next = !slot.posted_today;
    setSlots((prev) =>
      prev.map((item) =>
        item.id === slot.id
          ? { ...item, posted_today: next, last_posted_date: next ? todayStr() : "" }
          : item,
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
    setSlots((prev) => prev.filter((item) => item.id !== slot.id));
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
    <aside className="flex h-full w-80 shrink-0 flex-col border-l border-border bg-surface">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Timer className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">Controle de Posts</span>
          {pendingCount > 0 && (
            <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
              {pendingCount}
            </span>
          )}
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
          <div className="px-2 py-8 text-center text-xs text-muted">
            Adicione canais na aba <b className="text-foreground">Canais</b> para
            controlar os posts aqui.
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {channels.map((channel) => {
              const draft = drafts[channel.id] ?? draftFromSettings(settings[channel.id]);
              const saved = draftFromSettings(settings[channel.id]);
              const dirty = !sameDraft(draft, saved);
              const channelSlots = slotsByChannel[channel.id] ?? [];
              const scheduleUrl = channel.yt_schedule_url.trim() || defaultYoutubeScheduleUrl(channel);
              const done = channelSlots.filter((s) => s.posted_today).length;

              return (
                <div key={channel.id} className="overflow-hidden rounded-lg border border-border bg-surface-2">
                  {/* Cabeçalho do canal */}
                  <div className="flex items-center justify-between gap-2 px-3 pt-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">{channel.name}</div>
                      {!draft.use_yt_schedule && channelSlots.length > 0 && (
                        <div className="text-[11px] text-muted">
                          {done}/{channelSlots.length} postados hoje
                        </div>
                      )}
                    </div>
                    <div
                      className="flex shrink-0 items-center gap-1.5"
                      title="Este canal usa a grade de horários do YouTube"
                    >
                      <span className="text-[11px] text-muted">Grade YT</span>
                      <Switch on={draft.use_yt_schedule} onClick={() => updateDraft(channel.id, { use_yt_schedule: !draft.use_yt_schedule })} />
                    </div>
                  </div>

                  <div className="flex flex-col gap-2.5 p-3">
                    {draft.use_yt_schedule ? (
                      /* Modo grade do YouTube */
                      <>
                        <div className="rounded-md border border-border bg-background px-2 py-1.5 text-[11px] text-muted">
                          Link da grade definido na aba <span className="text-foreground">Canais</span>.
                        </div>
                        <div className="flex gap-2">
                          <a
                            href={scheduleUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-primary px-2 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
                          >
                            <CalendarClock className="h-3.5 w-3.5" /> Abrir grade
                          </a>
                          {dirty && (
                            <button
                              onClick={() => saveSettings(channel)}
                              disabled={savingChannel === channel.id}
                              className="rounded-md border border-primary/40 bg-primary/10 px-2 py-1.5 text-xs font-medium text-primary hover:bg-primary/20 disabled:opacity-50"
                            >
                              Salvar
                            </button>
                          )}
                        </div>
                      </>
                    ) : (
                      /* Modo automático: 1º post + intervalo */
                      <>
                        <div className="flex items-end gap-2">
                          <label className="flex-1">
                            <span className="mb-1 block text-[10px] uppercase tracking-wide text-muted">1º post</span>
                            <input
                              type="time"
                              value={draft.first_time}
                              onChange={(e) => updateDraft(channel.id, { first_time: e.target.value })}
                              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground outline-none focus:border-primary"
                            />
                          </label>
                          <label className="w-20">
                            <span className="mb-1 block text-[10px] uppercase tracking-wide text-muted">a cada (h)</span>
                            <input
                              type="number"
                              min="0.25"
                              max="24"
                              step="0.25"
                              value={draft.interval_hours}
                              onChange={(e) => updateDraft(channel.id, { interval_hours: Number(e.target.value) || 0.25 })}
                              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground outline-none focus:border-primary"
                            />
                          </label>
                          <button
                            onClick={() => saveSettings(channel)}
                            disabled={savingChannel === channel.id || !dirty}
                            className={cn(
                              "rounded-md px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-40",
                              dirty
                                ? "bg-primary text-primary-foreground hover:opacity-90"
                                : "border border-border bg-surface text-muted",
                            )}
                          >
                            Aplicar
                          </button>
                        </div>

                        {channelSlots.length === 0 ? (
                          <p className="py-1 text-center text-[11px] text-muted">
                            Defina o 1º post e o intervalo para gerar os horários.
                          </p>
                        ) : (
                          <div className="flex flex-col gap-1.5">
                            {channelSlots.map((slot) => (
                              <PostSlotRow
                                key={slot.id}
                                slot={slot}
                                now={now}
                                onToggle={() => togglePosted(slot)}
                                onRemove={() => removeSlot(slot)}
                              />
                            ))}
                          </div>
                        )}

                        {/* Horário avulso */}
                        <div className="flex items-center gap-1.5">
                          <input
                            type="time"
                            value={newTime[channel.id] ?? ""}
                            onChange={(e) => setNewTime((prev) => ({ ...prev, [channel.id]: e.target.value }))}
                            className="flex-1 rounded-md border border-dashed border-border bg-transparent px-2 py-1 text-xs text-foreground outline-none focus:border-primary"
                            placeholder="horário avulso"
                          />
                          <button
                            onClick={() => addSlot(channel.id)}
                            disabled={!newTime[channel.id]}
                            title="Adicionar horário avulso"
                            className="flex items-center gap-1 rounded-md border border-border bg-surface px-2 py-1 text-xs text-muted hover:text-foreground disabled:opacity-40"
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </>
                    )}
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

function PostSlotRow({
  slot,
  now,
  onToggle,
  onRemove,
}: {
  slot: PostSlot;
  now: Date;
  onToggle: () => void;
  onRemove: () => void;
}) {
  const cd = countdown(slot.target_time, now);
  const posted = slot.posted_today;
  const late = !posted && cd.tone === "late";

  return (
    <div
      className={cn(
        "group flex items-center gap-2.5 rounded-md border px-2.5 py-1.5 transition-colors",
        posted
          ? "border-success/30 bg-success/10"
          : late
            ? "border-danger/30 bg-danger/10"
            : "border-border bg-surface",
      )}
    >
      <button
        onClick={onToggle}
        title={posted ? "Desmarcar" : "Marcar que já postei"}
        className={cn(
          "flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-md border transition-colors",
          posted
            ? "border-success bg-success text-white"
            : "border-border text-transparent hover:border-primary",
        )}
      >
        <Check className="h-3 w-3" />
      </button>

      <span className={cn("text-sm font-semibold tabular-nums", posted && "text-muted line-through")}>
        {slot.target_time || "--:--"}
      </span>

      <span
        className={cn(
          "ml-auto text-[11px] font-medium",
          posted ? "text-success" : late ? "text-danger" : "text-success",
        )}
      >
        {posted ? "postado" : cd.label}
      </span>

      <button
        onClick={onRemove}
        title="Remover horário"
        className="shrink-0 rounded p-0.5 text-muted opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
