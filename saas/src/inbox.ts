import './style.css';
import { supabase, isAdmin, listSubmissions, getSubmission, references, evidenceUrl } from './api';
import { fileSize, formatDate, statusLabel, statuses, submissionIdFromPath, type Submission, type Status } from './domain';

const root = document.querySelector<HTMLDivElement>('#app')!;
const demo = import.meta.env.DEV && location.pathname === '/preview';
let refs: Awaited<ReturnType<typeof references>> = { competitions: [], seasons: [], phases: [] };
let page = 0;
let status: Status | '' = '';
let competition = '';
let season = '';
let rows: Submission[] = [];
let total = 0;
let currentId = submissionIdFromPath(location.pathname);
let authorized = false;
let generation = 0;
let detailGeneration = 0;
let refreshing = false;
let accountEmail = '';
let content: HTMLElement;
let list: HTMLElement;
let detail: HTMLElement;
let feedback: HTMLElement;
let counter: HTMLElement;
let pager: HTMLElement;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag); node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function button(text: string, className: string, action: () => void) {
  const node = el('button', className, text); node.type = 'button'; node.addEventListener('click', action); return node;
}
function mark() { const n = el('div', 'brand-mark', 'C'); n.setAttribute('aria-hidden', 'true'); return n; }
function brand() { const n = el('div', 'brand'); const text = el('div'); text.append(el('strong', '', 'LIGA CNA'), el('span', '', 'CLUBS PRO')); n.append(mark(), text); return n; }
function note(message: string, error = false) {
  feedback.textContent = message; feedback.className = error ? 'feedback error' : 'feedback'; feedback.setAttribute('role', error ? 'alert' : 'status');
}
function tag(s: Status) { return el('span', `status ${s}`, statusLabel[s]); }
function empty(title: string, description: string) {
  const wrap = el('div', 'empty'); wrap.append(el('div', 'empty-symbol', '↓'), el('h2', '', title), el('p', '', description)); return wrap;
}
function renderGate(title: string, description: string) {
  root.replaceChildren(); const gate = el('main', 'gate'); gate.append(brand()); const card = el('section', 'gate-card'); card.append(el('div', 'eyebrow', 'ADMINISTRACIÓN'), el('h1', '', title), el('p', 'muted', description)); gate.append(card); root.append(gate); return card;
}
function login() {
  authorized = false;
  const card = renderGate('Tu liga. Bajo control.', 'Inicia sesión para consultar los reportes y sus evidencias originales.');
  const form = el('form', 'login-form');
  const email = el('input'); email.type = 'email'; email.required = true; email.autocomplete = 'username'; email.id = 'email';
  const password = el('input'); password.type = 'password'; password.required = true; password.autocomplete = 'current-password'; password.id = 'password';
  for (const [title, input] of [['Correo electrónico', email], ['Contraseña', password]] as const) { const label = el('label', '', title); label.htmlFor = input.id; form.append(label, input); }
  const submit = el('button', 'primary', 'Entrar al panel'); submit.type = 'submit';
  const error = el('p', 'error'); error.setAttribute('role', 'alert');
  form.append(submit, error); form.addEventListener('submit', async event => {
    event.preventDefault(); submit.disabled = true; error.textContent = '';
    try { const result = await supabase!.auth.signInWithPassword({ email: email.value.trim(), password: password.value }); if (result.error) throw result.error; await boot(); }
    catch { error.textContent = 'No pudimos iniciar sesión. Revisa tus datos y la conexión.'; }
    finally { password.value = ''; submit.disabled = false; }
  }); card.append(form, el('p', 'gate-footer', 'Acceso exclusivo para administradores de Liga CNA.'));
}
function buildShell() {
  root.replaceChildren(); const shell = el('div', 'shell');
  const sidebar = el('aside', 'sidebar'); sidebar.append(brand(), el('div', 'nav-label', 'ADMINISTRACIÓN'));
  const nav = el('nav'); nav.setAttribute('aria-label', 'Navegación principal'); const inbox = el('a', 'nav-active', '▤  Evidencias'); inbox.href = '/admin/submissions'; inbox.setAttribute('aria-current', 'page'); nav.append(inbox); for (const [label,href] of [['← Centro de la liga','/admin'],['Ver web pública','/']]) {const a=el('a','nav-active',label);a.href=href;nav.append(a);} sidebar.append(nav);
  const asideFoot = el('div', 'sidebar-foot'); asideFoot.append(el('span', 'lock', 'ACCESO PRIVADO'), el('p', '', 'Los reportes recibidos no modifican las estadísticas oficiales.')); sidebar.append(asideFoot);
  content = el('main', 'workspace'); const top = el('header', 'topbar'); top.append(el('span', 'breadcrumb', 'Liga CNA / Administración'));
  const account = el('div', 'account'); account.append(el('span', '', demo ? 'Vista de demostración' : accountEmail), button(demo ? 'Salir de demo' : 'Cerrar sesión', 'text-button', () => { if (demo) location.href = '/'; else void signOut(); })); top.append(account);
  const heading = el('div', 'heading'); const title = el('div'); title.append(el('div', 'eyebrow', 'CENTRO DE RECEPCIÓN'), el('h1', '', 'Bandeja de evidencias'), el('p', 'muted', 'Cada captura, en su lugar. Cada original, protegido.'));
  heading.append(title, button('↻  Actualizar', 'secondary', () => void refresh()));
  const strip = el('div', 'info-strip'); strip.append(el('span', 'channel', 'WHATSAPP'), el('span', '', demo ? 'Demostración local · datos ficticios' : 'Recepción de capturas originales'), el('span', 'strip-end', 'Revisión administrativa'));
  const toolbar = el('div', 'toolbar'); counter = el('strong', 'count', 'Cargando…'); toolbar.append(counter);
  const filters = el('div', 'filters');
  const addSelect = (label: string, options: [string, string][], change: (value: string) => void) => {
    const wrap = el('label', 'filter'); wrap.append(el('span', '', label)); const select = el('select'); select.setAttribute('aria-label', label); options.forEach(([value, name]) => { const o = el('option', '', name); o.value = value; select.append(o); }); select.addEventListener('change', () => { change(select.value); page = 0; currentId = null; detailGeneration++; if (!demo) history.replaceState({}, '', '/admin/submissions'); void refresh(); }); wrap.append(select); filters.append(wrap); return select;
  };
  addSelect('Estado', [['', 'Todos los estados'], ...statuses.map(s => [s, statusLabel[s]] as [string,string])], v => { status = v as Status | ''; });
  const seasonSelect = addSelect('Temporada', [['', 'Todas las temporadas'], ['unassigned', 'Sin asignar'], ...refs.seasons.map(s => [s.id, s.name] as [string,string])], v => { season = v; });
  if (refs.competitions.length > 1) addSelect('Competición', [['', 'Todas'], ...refs.competitions.map(c => [c.id, c.name] as [string,string])], v => { competition = v; season = ''; seasonSelect.value = ''; });
  toolbar.append(filters); feedback = el('div', 'feedback'); feedback.setAttribute('aria-live', 'polite');
  const body = el('div', 'inbox-grid'); const left = el('section', 'list-panel'); left.setAttribute('aria-label', 'Reportes recibidos');
  const labels = el('div', 'list-labels'); labels.append(el('span', '', 'CAPTURA / REMITENTE'), el('span', '', 'RECIBIDO'));
  list = el('div', 'submission-list'); pager = el('div', 'pager'); left.append(labels, list, pager);
  detail = el('section', 'detail-panel'); detail.setAttribute('aria-label', 'Detalle de evidencia');
  body.append(left, detail); const footer = el('footer', 'workspace-footer'); footer.append(el('span', '', 'LIGA CNA · EA FC CLUBS PRO'), el('span', '', `Horarios: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`));
  content.append(top, heading, strip, toolbar, feedback, body, footer); shell.append(sidebar, content); root.append(shell);
}
function demoRows(): Submission[] {
  return ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333'].map((id, i) => ({
    id, upload_intent_id: id, competition_id: 'demo', season_id: null, phase_id: null, status: 'pending', sender_phone: `+1 555 010 010${i}`,
    whatsapp_phone_number_id: 'demo', whatsapp_message_id: `wamid.DEMOSTRACION_${i+1}`, whatsapp_media_id: `demo-${i}`,
    received_at: new Date(Date.now() - i * 3600000).toISOString(), original_image_path: `demostracion/captura-${i+1}.png`, original_mime_type: 'image/png', original_filename: `captura-${i+1}.png`, evidence_sha256: '0'.repeat(64), evidence_bytes: 1048576 + i * 200000,
    raw_metadata: {}, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }));
}
function renderList() {
  list.replaceChildren(); counter.textContent = `${total} ${total === 1 ? 'evidencia' : 'evidencias'}`;
  if (!rows.length) list.append(status || season || competition
    ? empty('No hay evidencias con estos filtros', 'Prueba con otro estado o temporada.')
    : empty('Todo listo para recibir', 'Las capturas aparecerán aquí cuando lleguen desde WhatsApp.'));
  for (const row of rows) {
    const b = button('', `submission ${row.id === currentId ? 'selected' : ''}`, () => void select(row.id)); b.setAttribute('aria-label', `Ver evidencia de ${row.sender_phone}`); b.setAttribute('aria-pressed', String(row.id === currentId));
    const preview = el('div', 'thumb'); preview.append(el('span', '', '▧')); const text = el('div', 'submission-text'); text.append(el('strong', '', row.sender_phone), el('span', 'filename', row.original_filename ?? 'Captura de WhatsApp'), el('span', 'file-meta', `${row.original_mime_type.split('/')[1].toUpperCase()} · ${fileSize(row.evidence_bytes)}`));
    const right = el('div', 'submission-right'); right.append(tag(row.status), el('time', '', formatDate(row.received_at))); b.append(preview, text, right); list.append(b);
    if (!demo) void evidenceUrl(row.original_image_path).then(url => { if (!b.isConnected) return; const img = el('img'); img.src = url; img.alt = ''; img.loading = 'lazy'; img.referrerPolicy = 'no-referrer'; img.onerror = () => { preview.textContent = '▧'; }; preview.replaceChildren(img); }).catch(() => { preview.title = 'Vista previa no disponible'; });
  }
  pager.replaceChildren(); const previous = button('← Anterior', 'text-button', () => { page--; void refresh(); }); previous.disabled = page === 0;
  const next = button('Siguiente →', 'text-button', () => { page++; void refresh(); }); next.disabled = (page+1)*20 >= total;
  pager.append(previous, el('span', '', `Página ${page+1} de ${Math.max(1, Math.ceil(total/20))}`), next);
}
async function select(id: string | null, navigate = true) {
  currentId = id; if (navigate && !demo) history.pushState({}, '', id ? `/admin/submissions/${id}` : '/admin/submissions');
  renderList(); const ticket = ++detailGeneration; detail.replaceChildren();
  if (!id) { detail.append(empty('Selecciona una evidencia', 'Consulta la captura original y los datos de recepción.')); return; }
  detail.append(el('p', 'loading', 'Cargando evidencia…'));
  try {
    const row = rows.find(r => r.id === id) ?? await getSubmission(id);
    if (ticket !== detailGeneration || !authorized) return;
    if (!row) { detail.replaceChildren(empty('Evidencia no disponible', 'No existe o no tienes permiso para consultarla.')); return; }
    detail.replaceChildren(); const head = el('div', 'detail-head'); head.append(el('div', 'eyebrow', 'EVIDENCIA ORIGINAL'), tag(row.status));
    const preview = el('div', 'evidence-preview'); preview.append(el('span', 'muted', demo ? 'Demostración · aquí verás la captura original' : 'Cargando original…'));
    const actions = el('div', 'evidence-actions'); const open = button('Abrir original ↗', 'secondary', () => void openEvidence(false)); const download = button('Descargar', 'text-button', () => void openEvidence(true));
    open.disabled = demo; download.disabled = demo; actions.append(open, download);
    const detailError = el('p', 'error'); detailError.setAttribute('role', 'alert');
    async function openEvidence(downloadFile: boolean) {
      open.disabled = true; download.disabled = true; detailError.textContent = '';
      try { const url = await evidenceUrl(row!.original_image_path, downloadFile); if (ticket !== detailGeneration || !authorized) return; const a = el('a'); a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.referrerPolicy = 'no-referrer'; a.click(); }
      catch { detailError.textContent = 'No se pudo abrir el archivo. Actualiza la evidencia e inténtalo de nuevo.'; }
      finally { open.disabled = false; download.disabled = false; }
    }
    const dl = el('dl', 'metadata');
    const add = (label: string, value: string, mono = false) => { const block = el('div', 'metadata-row'); block.append(el('dt', '', label), el('dd', mono ? 'mono' : '', value)); dl.append(block); };
    add('Remitente', row.sender_phone); add('Recibido', formatDate(row.received_at));
    add('Competición', refs.competitions.find(c => c.id === row.competition_id)?.name ?? 'Liga CNA');
    add('Temporada', refs.seasons.find(s => s.id === row.season_id)?.name ?? 'Sin asignar');
    add('Fase', refs.phases.find(p => p.id === row.phase_id)?.name ?? 'Sin asignar');
    add('Archivo', row.original_filename ?? 'Sin nombre original'); add('Formato / tamaño', `${row.original_mime_type} · ${fileSize(row.evidence_bytes)}`); add('ID de WhatsApp', row.whatsapp_message_id, true);
    const extra = el('details', 'technical'); extra.append(el('summary', '', 'Información de trazabilidad')); const extras = el('dl', 'metadata');
    for (const [k,v] of [['Ruta',row.original_image_path],['SHA-256',row.evidence_sha256],['ID de recepción',row.id]]) { const pair = el('div', 'metadata-row'); pair.append(el('dt', '', k), el('dd', 'mono', v)); extras.append(pair); } extra.append(extras);
    const notice = el('div', 'review-notice'); notice.append(el('strong', '', 'Recibido. Aún no es un resultado oficial.'), el('p', '', 'Prepara un reporte manual o con IA. Revisa los datos antes de aprobar.'));
    if (!demo) { const reviewLink=el('a','secondary','Preparar reporte →'); reviewLink.href='/admin?view=partidos&submission='+row.id+(row.season_id?'&season='+row.season_id:''); notice.append(reviewLink); }
    detail.append(head, preview, actions, detailError, dl, extra, notice);
    if (!demo) {
      try { const url = await evidenceUrl(row.original_image_path); if (ticket !== detailGeneration || !authorized) return; const image = el('img'); image.src = url; image.alt = `Captura enviada por ${row.sender_phone}`; image.referrerPolicy = 'no-referrer'; image.onerror = () => { if (ticket !== detailGeneration) return; preview.replaceChildren(el('p', 'muted', 'Original no disponible. Actualiza para renovar el acceso.')); }; preview.replaceChildren(image); }
      catch { preview.replaceChildren(el('p', 'muted', 'No pudimos cargar el original. Actualiza para volver a intentarlo.')); }
    }
  } catch { if (ticket === detailGeneration) detail.replaceChildren(empty('No pudimos cargar la evidencia', 'Revisa tu conexión y pulsa Actualizar.')); }
}
async function refresh() {
  if (refreshing || !authorized) return;
  refreshing = true; const ticket = generation; const queryKey = `${page}|${status}|${competition}|${season}`; note('Actualizando…');
  try {
    if (!demo) { const { data, error } = await supabase!.auth.getUser(); if (error || !data.user) { await signOut(); return; } if (!await isAdmin(data.user.id)) { await boot(); return; } }
    const result = demo ? { rows: demoRows().filter(r => !status || r.status === status).filter(() => !season || season === 'unassigned'), count: 0 } : await listSubmissions(page, status, competition, season);
    if (ticket !== generation || !authorized || queryKey !== `${page}|${status}|${competition}|${season}`) return;
    rows = result.rows; total = demo ? rows.length : result.count;
    if (page > 0 && !rows.length) { page--; refreshing = false; await refresh(); return; }
    renderList(); note(demo ? 'Datos ficticios. Esta vista no envía ni guarda información.' : `Actualizado ${new Date().toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}`);
    await select(currentId, false);
  } catch { if (ticket === generation) { rows = []; total = 0; currentId = null; renderList(); detail.replaceChildren(empty('Sin conexión', 'No se muestran datos guardados de sesiones anteriores.')); note('No pudimos consultar las evidencias. Revisa la conexión y pulsa Actualizar.', true); } }
  finally { refreshing = false; if (authorized && ticket === generation && queryKey !== `${page}|${status}|${competition}|${season}`) void refresh(); }
}
async function signOut() {
  authorized = false; generation++; detailGeneration++; rows = []; currentId = null; history.replaceState({}, '', '/admin/submissions');
  if (supabase) await supabase.auth.signOut({ scope: 'local' }); login();
}
async function boot() {
  const ticket = ++generation; detailGeneration++; authorized = false; refreshing = false;
  if (demo) { authorized = true; refs.competitions = [{id:'demo',name:'Liga CNA'}]; buildShell(); currentId = demoRows()[0].id; await refresh(); return; }
  if (!supabase) { const card = renderGate('Estamos preparando tu panel', 'La conexión segura con Liga CNA todavía no está configurada.'); card.append(el('p', 'gate-footer', 'Las evidencias serán privadas y solo estarán disponibles para administradores.')); if (import.meta.env.DEV) card.append(button('Ver demostración local →', 'secondary', () => { location.href = '/preview'; })); return; }
  renderGate('Conectando con Liga CNA', 'Verificando tu acceso…');
  try {
    const { data, error } = await supabase.auth.getUser();
    if (ticket !== generation) return;
    if (error || !data.user) { login(); return; }
    if (!await isAdmin(data.user.id)) { if (ticket !== generation) return; const card = renderGate('Acceso pendiente', 'Tu cuenta no tiene acceso de administrador a Liga CNA.'); card.append(button('Cerrar sesión', 'secondary', () => void signOut())); return; }
    const loaded = await references(); if (ticket !== generation) return;
    refs = loaded; accountEmail = data.user.email ?? 'Administrador'; authorized = true; buildShell(); await refresh();
  } catch { if (ticket !== generation) return; const card = renderGate('No pudimos conectar', 'Tu panel no está disponible por el momento. Revisa la conexión o vuelve a intentarlo.'); card.append(button('Reintentar', 'secondary', () => void boot()), button('Cerrar sesión', 'text-button', () => void signOut())); }
}
window.addEventListener('popstate', () => { if (authorized) void select(submissionIdFromPath(location.pathname), false); });
document.addEventListener('visibilitychange', () => { if (!document.hidden && authorized) void refresh(); });
setInterval(() => { if (!document.hidden && authorized) void refresh(); }, 30000);
supabase?.auth.onAuthStateChange(event => { if (event === 'SIGNED_OUT') { authorized = false; generation++; detailGeneration++; rows = []; login(); } });
void boot();


