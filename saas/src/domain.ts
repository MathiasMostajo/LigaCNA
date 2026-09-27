import type { Database } from './database.types';
export const statuses = ['pending', 'processing', 'needs_review', 'approved', 'rejected'] as const;
export type Status = typeof statuses[number];
export const statusLabel: Record<Status, string> = {
  pending: 'Pendiente', processing: 'Procesando', needs_review: 'Por revisar', approved: 'Aprobado', rejected: 'Rechazado',
};
export type Submission = Omit<Database['public']['Tables']['cna_submissions']['Row'], 'status'> & {status: Status};
export interface NamedRecord { id: string; name: string }
export function fileSize(bytes: number): string {
  return bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('es', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
}
export function submissionIdFromPath(path: string): string | null {
  const match = /^\/admin\/submissions\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/?$/i.exec(path);
  return match?.[1] ?? null;
}

