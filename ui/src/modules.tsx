import {
  Radar,
  Music,
  StickyNote,
  Globe,
  Tv,
  Cloud,
  type LucideIcon,
} from "lucide-react";

export type ModuleId =
  | "radar"
  | "sons"
  | "anotacoes"
  | "horarios"
  | "canais"
  | "nuvem";

export type ModuleDef = {
  id: ModuleId;
  label: string;
  icon: LucideIcon;
  description: string;
};

// Ordem da sidebar. O Radar vem primeiro: é o coração do sistema.
export const MODULES: ModuleDef[] = [
  {
    id: "radar",
    label: "Radar",
    icon: Radar,
    description: "Shorts virais fora da curva",
  },
  {
    id: "canais",
    label: "Canais",
    icon: Tv,
    description: "Seus canais e idade de cada um",
  },
  {
    id: "sons",
    label: "Sons",
    icon: Music,
    description: "Biblioteca de áudios",
  },
  {
    id: "anotacoes",
    label: "Anotações",
    icon: StickyNote,
    description: "Suas notas",
  },
  {
    id: "horarios",
    label: "Horários",
    icon: Globe,
    description: "Fusos do mundo todo",
  },
  {
    id: "nuvem",
    label: "Nuvem",
    icon: Cloud,
    description: "Backup e portabilidade",
  },
];
