import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import {
  Download,
  Filter,
  Loader2,
  Music,
  Search,
  Star,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { api, type Sound } from "@/lib/api";
import { cn } from "@/lib/utils";

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

type Message = { kind: "ok" | "err"; text: string };

type UploadForm = {
  file: File | null;
  name: string;
  category: string;
  tags: string;
};

const EMPTY_UPLOAD: UploadForm = {
  file: null,
  name: "",
  category: "",
  tags: "",
};

export function SoundsWorkspace() {
  const [sounds, setSounds] = useState<Sound[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);

  useEffect(() => {
    refresh();
  }, []);

  function refresh() {
    setLoading(true);
    api.sounds
      .list()
      .then(setSounds)
      .catch(() => setMessage({ kind: "err", text: "Não foi possível carregar os sons." }))
      .finally(() => setLoading(false));
  }

  const categories = useMemo(
    () =>
      Array.from(new Set(sounds.map((sound) => sound.category.trim()).filter(Boolean))).sort((a, b) =>
        a.localeCompare(b),
      ),
    [sounds],
  );

  const filteredSounds = useMemo(() => {
    const term = query.trim().toLowerCase();
    return sounds.filter((sound) => {
      if (term && !sound.name.toLowerCase().includes(term)) return false;
      if (category && sound.category !== category) return false;
      if (favoritesOnly && !sound.favorite) return false;
      return true;
    });
  }, [sounds, query, category, favoritesOnly]);

  async function toggleFavorite(sound: Sound) {
    const nextFavorite = sound.favorite ? 0 : 1;
    setSounds((prev) =>
      prev.map((item) => (item.id === sound.id ? { ...item, favorite: nextFavorite } : item)),
    );
    try {
      const updated = await api.sounds.update(sound.id, {
        name: sound.name,
        category: sound.category,
        tags: sound.tags,
        favorite: Boolean(nextFavorite),
      });
      setSounds((prev) => prev.map((item) => (item.id === sound.id ? updated : item)));
    } catch (e) {
      setMessage({ kind: "err", text: e instanceof Error ? e.message : "Falha ao favoritar." });
      refresh();
    }
  }

  async function remove(sound: Sound) {
    if (!window.confirm(`Remover o som "${sound.name}"?`)) return;
    setSounds((prev) => prev.filter((item) => item.id !== sound.id));
    await api.sounds.remove(sound.id).catch((e) => {
      setMessage({ kind: "err", text: e instanceof Error ? e.message : "Falha ao remover." });
      refresh();
    });
  }

  function addUploaded(sound: Sound) {
    setSounds((prev) => [sound, ...prev]);
    setMessage({ kind: "ok", text: "Som enviado para a biblioteca." });
  }

  return (
    <div className="flex h-full flex-col gap-4 overflow-auto">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
          <div className="relative w-full lg:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por nome"
              className="w-full rounded-lg border border-border bg-surface px-9 py-2 text-sm outline-none placeholder:text-muted focus:border-primary"
            />
          </div>

          <div className="relative w-full lg:w-56">
            <Filter className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full appearance-none rounded-lg border border-border bg-surface px-9 py-2 text-sm outline-none focus:border-primary"
            >
              <option value="">Todas as categorias</option>
              {categories.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={() => setFavoritesOnly((value) => !value)}
            className={cn(
              "flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors",
              favoritesOnly
                ? "border-warning/40 bg-warning/10 text-warning"
                : "border-border bg-surface text-muted hover:text-foreground",
            )}
          >
            <Star className={cn("h-4 w-4", favoritesOnly && "fill-warning")} />
            Só favoritos
          </button>
        </div>

        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted">
            {filteredSounds.length} de {sounds.length} som(ns)
          </p>
          <button
            onClick={() => setUploadOpen(true)}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            <Upload className="h-4 w-4" /> Enviar som
          </button>
        </div>
      </div>

      {message && (
        <div
          className={cn(
            "flex items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm",
            message.kind === "ok"
              ? "border-success/30 bg-success/10 text-success"
              : "border-danger/30 bg-danger/10 text-danger",
          )}
        >
          <span>{message.text}</span>
          <button onClick={() => setMessage(null)} title="Fechar" className="shrink-0 hover:opacity-80">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando sons...
        </div>
      ) : sounds.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border text-center text-muted">
          <Music className="h-9 w-9" />
          <span className="text-sm">Nenhum som salvo ainda.</span>
          <span className="max-w-sm text-xs">Envie áudios para montar sua biblioteca por categoria.</span>
        </div>
      ) : filteredSounds.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border text-center text-muted">
          <Search className="h-8 w-8" />
          <span className="text-sm">Nenhum som encontrado com estes filtros.</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 pb-4 lg:grid-cols-2 2xl:grid-cols-3">
          {filteredSounds.map((sound) => (
            <SoundCard
              key={sound.id}
              sound={sound}
              onFavorite={() => toggleFavorite(sound)}
              onRemove={() => remove(sound)}
            />
          ))}
        </div>
      )}

      {uploadOpen && (
        <UploadDialog categories={categories} onClose={() => setUploadOpen(false)} onUploaded={addUploaded} />
      )}
    </div>
  );
}

function SoundCard({
  sound,
  onFavorite,
  onRemove,
}: {
  sound: Sound;
  onFavorite: () => void;
  onRemove: () => void;
}) {
  const tags = splitTags(sound.tags);

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-medium">{sound.name || "(sem nome)"}</div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted">
            <span>{sound.category || "Sem categoria"}</span>
            <span>{formatBytes(sound.size_bytes)}</span>
            <span>{formatDate(sound.created_at)}</span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={onFavorite}
            title={sound.favorite ? "Remover dos favoritos" : "Favoritar"}
            className={cn(
              "rounded p-1.5 hover:bg-surface-2",
              sound.favorite ? "text-warning" : "text-muted hover:text-foreground",
            )}
          >
            <Star className={cn("h-4 w-4", sound.favorite && "fill-warning")} />
          </button>
          <a
            href={api.sounds.downloadUrl(sound.id)}
            title="Baixar"
            className="rounded p-1.5 text-muted hover:bg-surface-2 hover:text-foreground"
          >
            <Download className="h-4 w-4" />
          </a>
          <button
            onClick={onRemove}
            title="Remover"
            className="rounded p-1.5 text-muted hover:bg-surface-2 hover:text-danger"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <audio controls preload="none" src={api.sounds.streamUrl(sound.id)} className="h-10 w-full" />

      <div className="flex min-h-7 flex-wrap gap-1.5">
        {tags.length > 0 ? (
          tags.map((tag) => (
            <span key={tag} className="rounded border border-border bg-surface-2 px-2 py-1 text-[11px] text-muted">
              {tag}
            </span>
          ))
        ) : (
          <span className="text-xs text-muted">Sem tags</span>
        )}
      </div>
    </div>
  );
}

function UploadDialog({
  categories,
  onClose,
  onUploaded,
}: {
  categories: string[];
  onClose: () => void;
  onUploaded: (sound: Sound) => void;
}) {
  const [form, setForm] = useState<UploadForm>(EMPTY_UPLOAD);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof UploadForm>(key: K, value: UploadForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    if (file && file.size > MAX_UPLOAD_BYTES) {
      event.target.value = "";
      set("file", null);
      setError("O arquivo precisa ter até 50 MB.");
      return;
    }
    setForm((current) => ({
      ...current,
      file,
      name: current.name || (file ? file.name.replace(/\.[^/.]+$/, "") : ""),
    }));
    setError(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.file) {
      setError("Escolha um arquivo de áudio.");
      return;
    }
    if (!form.name.trim()) {
      setError("Dê um nome ao som.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const sound = await api.sounds.upload({
        file: form.file,
        name: form.name.trim(),
        category: form.category.trim(),
        tags: form.tags.trim(),
      });
      onUploaded(sound);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao enviar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button className="absolute inset-0 bg-background/80" onClick={onClose} aria-label="Fechar" />
      <form onSubmit={submit} className="relative w-full max-w-md rounded-lg border border-border bg-surface p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">Enviar som</h2>
          <button type="button" onClick={onClose} className="text-muted hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-col gap-3">
          <Field label="Arquivo de áudio">
            <input
              type="file"
              accept=".mp3,.wav,.ogg,.m4a,.aac,.flac,audio/*"
              onChange={onFileChange}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-surface-2 file:px-3 file:py-1.5 file:text-sm file:text-foreground"
            />
          </Field>

          <Field label="Nome">
            <input
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="ex.: Impacto curto"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none placeholder:text-muted focus:border-primary"
            />
          </Field>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Categoria">
              <input
                list="sound-categories"
                value={form.category}
                onChange={(e) => set("category", e.target.value)}
                placeholder="ex.: suspense"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none placeholder:text-muted focus:border-primary"
              />
              <datalist id="sound-categories">
                {categories.map((item) => (
                  <option key={item} value={item} />
                ))}
              </datalist>
            </Field>

            <Field label="Tags">
              <input
                value={form.tags}
                onChange={(e) => set("tags", e.target.value)}
                placeholder="boom, risada"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none placeholder:text-muted focus:border-primary"
              />
            </Field>
          </div>
        </div>

        {error && <div className="mt-3 text-sm text-danger">{error}</div>}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border bg-surface-2 px-4 py-2 text-sm hover:border-primary/50"
          >
            Cancelar
          </button>
          <button
            disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Enviar som
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-muted">{label}</span>
      {children}
    </label>
  );
}

function splitTags(value: string): string[] {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function formatBytes(value: number): string {
  if (!value) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let size = value;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}
