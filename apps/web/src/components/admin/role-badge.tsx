import type { Role } from '@monthati/shared';
import { GraduationCap, ScanLine, ShieldCheck, type LucideIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

const look: Record<Role, { label: string; icon: LucideIcon; tone: 'neutral' | 'primary' }> = {
  student: { label: 'Student', icon: GraduationCap, tone: 'neutral' },
  staff: { label: 'Gate staff', icon: ScanLine, tone: 'primary' },
  admin: { label: 'Admin', icon: ShieldCheck, tone: 'primary' },
};

export function RoleBadge({ role }: { role: Role }) {
  const { label, icon: Icon, tone } = look[role];
  return (
    <Badge tone={tone}>
      <Icon aria-hidden /> {label}
    </Badge>
  );
}
