import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';
import type { Submission, NamedRecord, Status } from './domain';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const supabase = url && key && !url.includes('your-project')
  ? createClient<Database>(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }) : null;

function client() { if (!supabase) throw new Error('Falta conectar la base de datos.'); return supabase; }
export async function isAdmin(userId: string): Promise<boolean> {
  const { data, error } = await client().from('cna_admins').select('user_id').eq('user_id', userId).eq('active', true).maybeSingle();
  if (error) throw error;
  return !!data;
}
export async function listSubmissions(page: number, status: Status | '', competition: string, season: string) {
  let query = client().from('cna_submissions').select('*', { count: 'exact' })
    .order('received_at', { ascending: false }).order('id', { ascending: false });
  if (status) query = query.eq('status', status);
  if (competition) query = query.eq('competition_id', competition);
  if (season) query = season === 'unassigned' ? query.is('season_id', null) : query.eq('season_id', season);
  const { data, count, error } = await query.range(page * 20, page * 20 + 19);
  if (error) throw error;
  return { rows: data as Submission[], count: count ?? 0 };
}
export async function getSubmission(id: string) {
  const { data, error } = await client().from('cna_submissions').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data as Submission | null;
}
export async function references(): Promise<{ competitions: NamedRecord[]; seasons: (NamedRecord & {competition_id: string})[]; phases: NamedRecord[] }> {
  const [a, b, c] = await Promise.all([
    client().from('cna_competitions').select('id,name').order('name'),
    client().from('cna_seasons').select('id,name,competition_id').order('name'),
    client().from('cna_phases').select('id,name').order('name'),
  ]);
  if (a.error || b.error || c.error) throw a.error || b.error || c.error;
  return { competitions: a.data!, seasons: b.data!, phases: c.data! };
}
export async function evidenceUrl(path: string, download = false) {
  const { data, error } = await client().storage.from('match-evidence').createSignedUrl(path, 120, download ? { download: true } : undefined);
  if (error) throw error;
  if (!data?.signedUrl || new URL(data.signedUrl).origin !== new URL(url).origin) throw new Error('Enlace de evidencia inválido.');
  return data.signedUrl;
}

