import {
  Cpu,
  Plane,
  Trophy,
  ChefHat,
  Music,
  FlaskConical,
  Landmark,
  Leaf,
  Palette,
  Briefcase,
  HeartPulse,
  Clapperboard,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type InterestDefinition = {
  id: string;
  label: string;
  icon: LucideIcon;
  color: string;
};

export const INTERESTS: readonly InterestDefinition[] = [
  { id: "technology", label: "Technology", icon: Cpu,          color: "#3B82F6" },
  { id: "travel",     label: "Travel",     icon: Plane,        color: "#0D7377" },
  { id: "sports",     label: "Sports",     icon: Trophy,       color: "#EF4444" },
  { id: "cooking",    label: "Cooking",    icon: ChefHat,      color: "#F2A541" },
  { id: "music",      label: "Music",      icon: Music,        color: "#8B5CF6" },
  { id: "science",    label: "Science",    icon: FlaskConical, color: "#06B6D4" },
  { id: "history",    label: "History",    icon: Landmark,     color: "#92400E" },
  { id: "nature",     label: "Nature",     icon: Leaf,         color: "#16A34A" },
  { id: "art",        label: "Art",        icon: Palette,      color: "#EC4899" },
  { id: "business",   label: "Business",   icon: Briefcase,    color: "#475569" },
  { id: "health",     label: "Health",     icon: HeartPulse,   color: "#10B981" },
  { id: "movies",     label: "Movies",     icon: Clapperboard, color: "#F59E0B" },
] as const;

export type InterestId = (typeof INTERESTS)[number]["id"];

export const MIN_INTERESTS = 2;
export const MAX_INTERESTS = 5;
