import { useEffect, useState } from "react";
import {
  Plus,
  Tv,
  ExternalLink,
  Pencil,
  Trash2,
  Cake,
  X,
  Loader2,
} from "lucide-react";
import { api, type Channel, type ChannelInput } from "@/lib/api";

const EMPTY: ChannelInput = { name: "", channel_id: "", url: "", first_video_date: "", niche: "" };

export function ChannelsWorkspace() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Channel | "new" | null>(null);

  useEffect(() => {
    refresh();
  }, []);

  function refresh() {
    setLoading(true);
    api.channels
      .list()
      .then(setChannels)
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  async function remove(channel: Channel) {
    if (!window.confirm(`Remover o canal "${channel.name}"?`)) return;
    setChannels((prev) => prev.filter((c) => c.id !== channel.id));
    await api.channels.remove(channel.id).catch(refresh);
  }

  return (
    <div className="flex h-full flex-col gap-4 overflow-auto">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">{channels.length} canal(is)</p>
        <button
          onClick={() => setEditing("new")}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> Adicionar canal
        </button>
      </div>

      {loading ? (
        <div className="flex flex-1 items-center justify-center text-sm text-muted">Carregando…</div>
      ) : channels.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border text-muted">
          <Tv className="h-8 w-8" />
          <span className="text-sm">Nenhum canal ainda. Adicione o primeiro.</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 pb-4 sm:grid-cols-2 lg:grid-cols-3">
          {channels.map((c) => (
            <ChannelCard key={c.id} channel={c} onEdit={() => setEditing(c)} onRemove={() => remove(c)} />
          ))}
        </div>
      )}

      {editing && (
        <ChannelForm
          channel={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function ChannelCard({
  channel,
  onEdit,
  onRemove,
}: {
  channel: Channel;
  onEdit: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate font-medium">{channel.name}</div>
          {channel.niche && <div className="truncate text-[11px] text-muted">{channel.niche}</div>}
        </div>
        <div className="flex shrink-0 gap-1">
          <button onClick={onEdit} title="Editar" className="rounded p-1.5 text-muted hover:bg-surface-2 hover:text-foreground">
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button onClick={onRemove} title="Remover" className="rounded p-1.5 text-muted hover:bg-surface-2 hover:text-danger">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 rounded-lg bg-surface-2 px-3 py-2">
        <Cake className="h-4 w-4 text-primary" />
        {channel.age_days != null ? (
          <div>
            <span className="text-xl font-bold tabular-nums">{channel.age_days}</span>
            <span className="ml-1 text-xs text-muted">dias de vida</span>
          </div>
        ) : (
          <span className="text-xs text-muted">defina a data do 1º vídeo</span>
        )}
      </div>

      <a
        href={channel.studio_url}
        target="_blank"
        rel="noreferrer"
        className="flex items-center justify-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm font-medium hover:border-primary/50"
      >
        <ExternalLink className="h-4 w-4" /> Abrir Studio
      </a>
    </div>
  );
}

function ChannelForm({
  channel,
  onClose,
  onSaved,
}: {
  channel: Channel | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<ChannelInput>(
    channel
      ? {
          name: channel.name,
          channel_id: channel.channel_id,
          url: channel.url,
          first_video_date: channel.first_video_date,
          niche: channel.niche,
        }
      : EMPTY,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof ChannelInput>(key: K, value: ChannelInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function save() {
    if (!form.name?.trim()) {
      setError("Dê um nome ao canal.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (channel) await api.channels.update(channel.id, form);
      else await api.channels.create(form);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-xl border border-border bg-surface p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">{channel ? "Editar canal" : "Novo canal"}</h2>
          <button onClick={onClose} className="text-muted hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-col gap-3">
          <Field label="Nome do canal">
            <input
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              autoFocus
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </Field>
          <Field label="URL do canal (cole o link; o ID é detectado p/ o Studio)">
            <input
              value={form.url}
              onChange={(e) => set("url", e.target.value)}
              placeholder="https://www.youtube.com/channel/UC..."
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Data do 1º vídeo">
              <input
                type="date"
                value={form.first_video_date}
                onChange={(e) => set("first_video_date", e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
              />
            </Field>
            <Field label="Nicho">
              <input
                value={form.niche}
                onChange={(e) => set("niche", e.target.value)}
                placeholder="ex.: curiosidades"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </Field>
          </div>
        </div>

        {error && <div className="mt-3 text-sm text-danger">{error}</div>}

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-border bg-surface-2 px-4 py-2 text-sm hover:border-primary/50">
            Cancelar
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-muted">{label}</span>
      {children}
    </label>
  );
}
