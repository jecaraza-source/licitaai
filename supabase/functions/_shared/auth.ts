// LicitaAI — P0.2: autorización compartida para Edge Functions.
//
// Hasta ahora cada función corría con el service role y sin verificar el
// header Authorization en absoluto — cualquiera que conociera (o
// adivinara) la URL pública de la función podía invocarla directamente con
// cualquier licitacion_id/documento_id/etc., saltándose por completo el
// control de acceso que sí aplica la capa de Next.js (que solo revela
// recursos de la organización del usuario autenticado vía RLS antes de
// invocar la función). authenticate() cierra ese hueco: TODA función que
// lea o escriba datos de una organización debe llamarla primero.
//
// Patrón de uso:
//   const ctx = await authenticate(req, { ruta: "mi-funcion", requiereEscritura: true });
//   if (ctx instanceof Response) return ctx;
//   const licitacion = await requireLicitacion(ctx, licitacion_id);
//   if (licitacion instanceof Response) return licitacion;
//   // a partir de aquí, ctx.service (service role) ya está autorizado
//   // para trabajar sobre licitacion_id — la verificación de pertenencia
//   // a la organización ya ocurrió vía RLS en requireLicitacion().
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "./cors.ts";

export interface AuthContext {
  userId: string;
  email: string;
  organizationId: string;
  rol: string;
  /** Cliente con el JWT del llamante — RLS activo. Úsalo para CUALQUIER
   * lectura que determine si un recurso pertenece a la organización del
   * usuario: una fila de otra organización simplemente no aparece (nunca
   * se revela si existe), en vez de tener que replicar manualmente la
   * lógica de "organization_id = ..." en cada función. */
  asUser: SupabaseClient;
  /** Service role — bypassa RLS. Úsalo solo DESPUÉS de haber confirmado
   * la pertenencia del recurso vía asUser, para el resto del trabajo
   * (llamadas a IA, escrituras en cascada, etc.). */
  service: SupabaseClient;
}

export function jsonError(status: number, error: string): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function jsonOk(data: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify({ ok: true, data }), {
    ...init,
    headers: { ...corsHeaders, "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
}

interface AuthenticateOptions {
  /** Identificador estable de la función, usado como `ruta` en
   * check_rate_limit (ventana de 1 minuto, ya existente en Postgres). */
  ruta: string;
  /** true si la operación modifica datos o gasta cuota de IA — rechaza a
   * VIEWER con 403 antes de hacer cualquier trabajo. */
  requiereEscritura?: boolean;
  maxPorMinuto?: number;
}

/**
 * Verifica el JWT del header Authorization contra GoTrue, recupera
 * organización y rol desde Postgres (nunca desde el body de la solicitud
 * ni desde el JWT sin verificar), aplica rate limiting por ruta+usuario, y
 * — si requiereEscritura — rechaza a VIEWER. Devuelve un AuthContext listo
 * para usar, o un Response de error que el handler debe regresar tal cual.
 */
export async function authenticate(
  req: Request,
  opts: AuthenticateOptions,
): Promise<AuthContext | Response> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return jsonError(401, "No autenticado");
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // El apikey de este cliente es el anon key, pero el rol de Postgres
  // efectivo lo determina el JWT del header Authorization (claim `role`):
  // un token de usuario real se evalúa como `authenticated`, con
  // auth.uid() resuelto y RLS aplicado normalmente.
  const asUser = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  const {
    data: { user },
    error: userError,
  } = await asUser.auth.getUser();
  if (userError || !user) {
    return jsonError(401, "No autenticado");
  }

  const service = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const { data: perfil } = await service
    .from("users")
    .select("organization_id, rol")
    .eq("id", user.id)
    .maybeSingle();

  if (!perfil) {
    return jsonError(403, "Perfil no encontrado");
  }

  if (opts.requiereEscritura && perfil.rol === "VIEWER") {
    return jsonError(403, "Tu rol (VIEWER) no permite ejecutar esta operación");
  }

  // check_rate_limit es SECURITY DEFINER, keyed por auth.uid() — se llama
  // vía asUser para que auth.uid() resuelva al usuario real. Esto impide
  // que invocar la Edge Function directamente (saltándose la ruta de
  // Next.js) evada el límite: la ventana es la misma sin importar el
  // origen de la llamada.
  const { data: dentroDelLimite, error: rlError } = await asUser.rpc("check_rate_limit", {
    p_ruta: opts.ruta,
    p_max_por_minuto: opts.maxPorMinuto ?? 10,
  });
  if (rlError || !dentroDelLimite) {
    return jsonError(429, "Límite de solicitudes excedido, intenta de nuevo en un minuto");
  }

  return {
    userId: user.id,
    email: user.email ?? "",
    organizationId: perfil.organization_id,
    rol: perfil.rol,
    asUser,
    service,
  };
}

/** Confirma que licitacion_id existe Y pertenece a la organización del
 * llamante (vía RLS con ctx.asUser) — nunca revela si una fila de otra
 * organización existe. */
export async function requireLicitacion(
  ctx: AuthContext,
  licitacionId: unknown,
): Promise<{ id: string; organization_id: string } | Response> {
  if (typeof licitacionId !== "string" || licitacionId.length === 0) {
    return jsonError(400, "licitacion_id requerido");
  }
  const { data } = await ctx.asUser
    .from("licitaciones")
    .select("id, organization_id")
    .eq("id", licitacionId)
    .maybeSingle();
  if (!data) {
    return jsonError(404, "Licitación no encontrada");
  }
  return data;
}

/** Confirma que documentoId existe, pertenece a licitacionId, y que esa
 * licitación pertenece a la organización del llamante — todo vía RLS. */
export async function requireDocumento(
  ctx: AuthContext,
  documentoId: unknown,
  licitacionId: string,
): Promise<{ id: string; nombre: string; licitacion_id: string } | Response> {
  if (typeof documentoId !== "string" || documentoId.length === 0) {
    return jsonError(400, "documento_id requerido");
  }
  const { data } = await ctx.asUser
    .from("documentos")
    .select("id, nombre, licitacion_id")
    .eq("id", documentoId)
    .eq("licitacion_id", licitacionId)
    .maybeSingle();
  if (!data) {
    return jsonError(404, "Documento no encontrado");
  }
  return data;
}

/** Igual que requireDocumento, pero cuando la solicitud solo trae
 * documento_id (sin licitacion_id ya conocido) — devuelve también su
 * licitacion_id para que el llamante pueda usarlo después. */
export async function requireDocumentoById(
  ctx: AuthContext,
  documentoId: unknown,
): Promise<{ id: string; nombre: string; licitacion_id: string; storage_path: string } | Response> {
  if (typeof documentoId !== "string" || documentoId.length === 0) {
    return jsonError(400, "documento_id requerido");
  }
  const { data } = await ctx.asUser
    .from("documentos")
    .select("id, nombre, licitacion_id, storage_path")
    .eq("id", documentoId)
    .maybeSingle();
  if (!data) {
    return jsonError(404, "Documento no encontrado");
  }
  return data;
}

/** Confirma que checklistItemId existe y pertenece a licitacionId — vía
 * RLS (checklist_items ya filtra por licitacion_org_matches). */
export async function requireChecklistItem(
  ctx: AuthContext,
  checklistItemId: unknown,
  licitacionId: string,
): Promise<{ id: string; licitacion_id: string } | Response> {
  if (typeof checklistItemId !== "string" || checklistItemId.length === 0) {
    return jsonError(400, "checklist_item_id requerido");
  }
  const { data } = await ctx.asUser
    .from("checklist_items")
    .select("id, licitacion_id")
    .eq("id", checklistItemId)
    .eq("licitacion_id", licitacionId)
    .maybeSingle();
  if (!data) {
    return jsonError(404, "Elemento de checklist no encontrado");
  }
  return data;
}

/** Confirma que documentoCorporativoId existe y pertenece a la
 * organización del llamante — vía RLS. */
export async function requireDocumentoCorporativo(
  ctx: AuthContext,
  documentoId: unknown,
): Promise<{ id: string; tipo: string; nombre: string; storage_path: string; empresa_perfil_id: string } | Response> {
  if (typeof documentoId !== "string" || documentoId.length === 0) {
    return jsonError(400, "documento_id requerido");
  }
  const { data } = await ctx.asUser
    .from("documentos_corporativos")
    .select("id, tipo, nombre, storage_path, empresa_perfil_id")
    .eq("id", documentoId)
    .maybeSingle();
  if (!data) {
    return jsonError(404, "Documento no encontrado");
  }
  return data;
}

/** Confirma que empresaPerfilId existe y pertenece a la organización del
 * llamante — vía RLS. */
export async function requireEmpresaPerfil(
  ctx: AuthContext,
  empresaPerfilId: unknown,
): Promise<{ id: string; organization_id: string } | Response> {
  if (typeof empresaPerfilId !== "string" || empresaPerfilId.length === 0) {
    return jsonError(400, "empresa_perfil_id requerido");
  }
  const { data } = await ctx.asUser
    .from("empresa_perfil")
    .select("id, organization_id")
    .eq("id", empresaPerfilId)
    .maybeSingle();
  if (!data) {
    return jsonError(404, "Perfil de empresa no encontrado");
  }
  return data;
}
