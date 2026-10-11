import type { EventCategory } from '@monthati/shared';
import {
  Briefcase,
  GraduationCap,
  HeartPulse,
  Landmark,
  Music,
  Palette,
  PartyPopper,
  Sparkles,
  Trophy,
  type LucideIcon,
} from 'lucide-react';

export const categoryIcons: Record<EventCategory, LucideIcon> = {
  party: PartyPopper,
  music: Music,
  sport: Trophy,
  arts: Palette,
  culture: Landmark,
  academic: GraduationCap,
  career: Briefcase,
  wellness: HeartPulse,
  other: Sparkles,
};
