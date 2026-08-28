// P1.3 — fixtures compartidas para los tests de integración y e2e.
//
// Antes cada archivo de test reimplementaba su propio `makeOrgWithUser` /
// `makeLicitacion`. Esto centraliza el andamiaje: organizaciones A/B,
// usuarios con los cuatro roles (ADMIN/MANAGER/ANALYST/VIEWER),
// licitaciones, documentos e invitaciones válidas/vencidas — cada una con
// su función de limpieza.
//
// Requiere el stack local de Supabase (`npx supabase start`). Nunca
// apuntar a un proyecto remoto: crea y borra auth.users / organizations
// reales con la service role key.
import { createClient } from "@supabase/supabase-js";
import { LOCAL } from "./local-supabase.mjs";

export const URL = process.env.SUPABASE_URL ?? LOCAL.url;
export const ANON_KEY =
  process.env.SUPABASE_ANON_KEY ?? LOCAL.anonKey;
const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? LOCAL.serviceRoleKey;

if (URL.includes("supabase.co")) {
  throw new Error("fixtures: SUPABASE_URL apunta a un proyecto remoto — solo local.");
}

export const admin = createClient(URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

export const ROLES = ["ADMIN", "MANAGER", "ANALYST", "VIEWER"];
export const PASSWORD = "TestPassword123!";
export const rnd = () => Math.random().toString(36).slice(2, 10);

/** Cliente Supabase autenticado como un usuario concreto (RLS activo). */
export async function clienteComo(email, password = PASSWORD) {
  const client = createClient(URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`clienteComo(${email}): ${error.message}`);
  return client;
}

async function crearUsuario(orgId, rol) {
  // handle_new_user() (P0.1) rechaza cualquier alta sin un ticket/invite
  // válido, así que cada usuario consume su propio ticket de la org (queda
  // ADMIN) y después se le fija el rol real.
  const { data: ticket, error: tErr } = await admin
    .from("signup_tickets")
    .insert({ organization_id: orgId })
    .select("id")
    .single();
  if (tErr) throw new Error(`crearUsuario(${rol}) ticket: ${tErr.message}`);

  const email = `${rol.toLowerCase()}-${rnd()}@example.org`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { nombre: `${rol} de prueba`, signup_ticket: ticket.id },
  });
  if (error) throw new Error(`crearUsuario(${rol}): ${error.message}`);
  const userId = data.user.id;
  if (rol !== "ADMIN") {
    await admin.from("users").update({ rol }).eq("id", userId);
  }
  return { userId, email, rol };
}

/**
 * Crea una organización con un usuario por cada rol pedido (por defecto los
 * cuatro). Devuelve `{ orgId, usuarios: { ADMIN, MANAGER, ... }, cliente,
 * limpiar }`. `cliente(rol)` devuelve un cliente Supabase autenticado como
 * ese usuario.
 */
export async function crearOrganizacion({ nombre, roles = ROLES } = {}) {
  const { data: org } = await admin
    .from("organizations")
    .insert({ nombre: nombre ?? `Org ${rnd()}` })
    .select("id")
    .single();
  const orgId = org.id;

  const usuarios = {};
  for (const rol of roles) {
    usuarios[rol] = await crearUsuario(orgId, rol);
  }

  return {
    orgId,
    usuarios,
    cliente: (rol) => clienteComo(usuarios[rol].email),
    async limpiar() {
      await admin.from("organizations").delete().eq("id", orgId);
      for (const u of Object.values(usuarios)) {
        await admin.auth.admin.deleteUser(u.userId).catch(() => {});
      }
    },
  };
}

/** Dos organizaciones aisladas (A y B) para probar multi-tenant. */
export async function crearOrganizacionesAyB(opts = {}) {
  const a = await crearOrganizacion({ nombre: `Org A ${rnd()}`, ...opts });
  const b = await crearOrganizacion({ nombre: `Org B ${rnd()}`, ...opts });
  return {
    a,
    b,
    async limpiar() {
      await a.limpiar();
      await b.limpiar();
    },
  };
}

export async function crearLicitacion(orgId, overrides = {}) {
  const { data, error } = await admin
    .from("licitaciones")
    .insert({
      organization_id: orgId,
      numero_expediente: `EXP-${rnd()}`,
      titulo: `Licitación ${rnd()}`,
      institucion: "Instituto de Prueba",
      tipo: "ADQUISICION",
      estado_id: "FEDERAL",
      sistema: "COMPRANET",
      ...overrides,
    })
    .select("*")
    .single();
  if (error) throw new Error(`crearLicitacion: ${error.message}`);
  return data;
}

export async function crearDocumento(licitacionId, overrides = {}) {
  const { data, error } = await admin
    .from("documentos")
    .insert({
      licitacion_id: licitacionId,
      tipo_documento: "BASES",
      nombre: `doc-${rnd()}.pdf`,
      storage_path: `${licitacionId}/${rnd()}.pdf`,
      ...overrides,
    })
    .select("*")
    .single();
  if (error) throw new Error(`crearDocumento: ${error.message}`);
  return data;
}

/** Invitación de staff. `{ vencida: true }` la crea ya expirada. */
export async function crearInvitacion(orgId, { vencida = false, rolJerarquico = "EJECUTOR" } = {}) {
  const { data, error } = await admin
    .from("invitaciones_staff")
    .insert({
      organization_id: orgId,
      email: `invitado-${rnd()}@example.org`,
      rol_jerarquico: rolJerarquico,
      expires_at: vencida
        ? new Date(Date.now() - 24 * 3600 * 1000).toISOString()
        : new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
    })
    .select("*")
    .single();
  if (error) throw new Error(`crearInvitacion: ${error.message}`);
  return data;
}
