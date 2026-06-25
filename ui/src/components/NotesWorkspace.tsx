import { useEffect, useRef, useState } from "react";
import { Plus, Trash2, StickyNote, Check, Loader2 } from "lucide-react";
import { api, type Note } from "@/lib/api";
import { cn } from "@/lib/utils";

export function NotesWorkspace() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const skipSave = useRef(true);

  useEffect(() => {
    api.notes.list().then((list) => {
      setNotes(list);
      if (list.length > 0) select(list[0]);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function select(note: Note) {
    skipSave.current = true;
    setSelectedId(note.id);
    setTitle(note.title);
    setBody(note.body);
    setStatus("idle");
  }

  async function newNote() {
    const note = await api.notes.create({ title: "", body: "" });
    setNotes((prev) => [note, ...prev]);
    select(note);
  }

  async function remove(note: Note) {
    if (!window.confirm("Apagar esta anotação?")) return;
    setNotes((prev) => prev.filter((n) => n.id !== note.id));
    if (selectedId === note.id) {
      setSelectedId(null);
      setTitle("");
      setBody("");
    }
    await api.notes.remove(note.id).catch(() => {});
  }

  // Autosave com debounce.
  useEffect(() => {
    if (skipSave.current) {
      skipSave.current = false;
      return;
    }
    if (!selectedId) return;
    setStatus("saving");
    const id = setTimeout(async () => {
      try {
        const updated = await api.notes.update(selectedId, { title, body });
        setNotes((prev) =>
          prev
            .map((n) => (n.id === selectedId ? updated : n))
            .sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
        );
        setStatus("saved");
      } catch {
        setStatus("idle");
      }
    }, 700);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, body]);

  return (
    <div className="flex h-full gap-4">
      {/* Lista */}
      <div className="flex w-64 shrink-0 flex-col gap-2">
        <button
          onClick={newNote}
          className="flex items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> Nova anotação
        </button>
        <div className="flex-1 overflow-auto">
          {notes.length === 0 ? (
            <div className="px-2 py-8 text-center text-xs text-muted">Nenhuma anotação.</div>
          ) : (
            notes.map((n) => (
              <button
                key={n.id}
                onClick={() => select(n)}
                className={cn(
                  "group flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left",
                  selectedId === n.id ? "bg-surface-2" : "hover:bg-surface-2/60",
                )}
              >
                <span className="truncate text-sm">{n.title || "(sem título)"}</span>
                <Trash2
                  onClick={(e) => {
                    e.stopPropagation();
                    remove(n);
                  }}
                  className="h-3.5 w-3.5 shrink-0 text-muted opacity-0 hover:text-danger group-hover:opacity-100"
                />
              </button>
            ))
          )}
        </div>
      </div>

      {/* Editor */}
      <div className="flex flex-1 flex-col rounded-lg border border-border bg-surface">
        {selectedId ? (
          <>
            <div className="flex items-center gap-2 border-b border-border px-4 py-2">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Título"
                className="flex-1 bg-transparent text-base font-medium outline-none placeholder:text-muted"
              />
              <span className="flex items-center gap-1 text-[11px] text-muted">
                {status === "saving" && <Loader2 className="h-3 w-3 animate-spin" />}
                {status === "saving" ? "salvando…" : status === "saved" ? <><Check className="h-3 w-3 text-success" /> salvo</> : ""}
              </span>
            </div>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Escreva aqui…"
              className="flex-1 resize-none bg-transparent px-4 py-3 text-sm leading-relaxed outline-none placeholder:text-muted"
            />
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-muted">
            <StickyNote className="h-8 w-8" />
            <span className="text-sm">Selecione ou crie uma anotação.</span>
          </div>
        )}
      </div>
    </div>
  );
}
