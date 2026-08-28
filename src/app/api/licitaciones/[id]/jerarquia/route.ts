import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { apiRoute, ApiError, requireWriteRole } from "@/lib/api";

const NIVELES = ["ejecutor", "integrador", "supervisor"] as const;
type Nivel = (typeof NIVELES)[number];

const NIVEL_ANTERIOR: Record<Nivel, Nivel | null> = {
  ejecutor: null,
  integrador: "ejecutor",
  supervisor: "integrador",
};

const VACIA = {
  id: null,
  ejecutor_id: null,
  integrador_id: null,
  supervisor_id: null,
  ejecutor_autorizado_at: null,
  integrador_autorizado_at: null,
  supervisor_autorizado_at: null,
};

const paramsSchema = z.object({ id: z.string().uuid("id debe ser un UUID válido") });
const putBodySchema = z.object({
  nivel: z.enum(NIVELES),
  usuario_id: z.string().uuid().nullable().optional(),
});
const postBodySchema = z.object({ nivel: z.enum(NIVELES) });

// Solo crea la fila cuando hace falta escribir en ella (asignar/autorizar).
// El GET nunca inserta — así un usuario de solo lectura (VIEWER) puede ver
// la cadena vacía sin chocar con la política de escritura de la tabla.
async function obtenerOCrear(supabase: SupabaseClient, licitacionId: string) {
  const { data: existente } = await supabase
    .from("licitacion_jerarquia")
    .select("*")
    .eq("licitacion_id", licitacionId)
    .maybeSingle();

  if (existente) return existente;

  const { data: creado, error } = await supabase
    .from("licitacion_jerarquia")
    .insert({ licitacion_id: licitacionId })
    .select("*")
    .single();

  // apiRoute() captura cualquier throw no controlado y lo convierte en un
  // 500 seguro (INTERNAL_ERROR) — antes, esto escapaba sin capturar fuera
  // del patrón {error} del resto de la ruta.
  if (error) throw new Error(error.message);
  return creado;
}

export const GET = apiRoute({ paramsSchema }, async ({ ctx, params }) => {
  const { data: existente } = await ctx.supabase
    .from("licitacion_jerarquia")
    .select("*")
    .eq("licitacion_id", params.id)
    .maybeSingle();

  return { data: { ...(existente ?? { ...VACIA, licitacion_id: params.id }), userId: ctx.userId } };
});

export const PUT = apiRoute({ paramsSchema, bodySchema: putBodySchema }, async ({ ctx, params, body }) => {
  requireWriteRole(ctx);

  if (body.usuario_id) {
    const { data: usuarioAsignado } = await ctx.supabase
      .from("users")
      .select("rol_jerarquico")
      .eq("id", body.usuario_id)
      .maybeSingle();
    if (usuarioAsignado?.rol_jerarquico !== body.nivel.toUpperCase()) {
      throw ApiError.validation(`Esa persona no tiene el rango de ${body.nivel} asignado en Configuración`);
    }
  }

  await obtenerOCrear(ctx.supabase, params.id);

  // Reasignar un nivel invalida su autorización y la de los niveles
  // posteriores en la cadena — la autorización dada era para la persona
  // anterior, no para quien entra ahora.
  const patch: Record<string, unknown> = { [`${body.nivel}_id`]: body.usuario_id || null };
  const idxNivel = NIVELES.indexOf(body.nivel);
  for (let i = idxNivel; i < NIVELES.length; i++) {
    patch[`${NIVELES[i]}_autorizado_at`] = null;
  }

  const { data, error } = await ctx.supabase
    .from("licitacion_jerarquia")
    .update(patch)
    .eq("licitacion_id", params.id)
    .select("*")
    .single();

  if (error) throw ApiError.internal();
  return { data };
});

export const POST = apiRoute(
  { paramsSchema, bodySchema: postBodySchema },
  async ({ ctx, params, body }) => {
    requireWriteRole(ctx);

    const jerarquia = await obtenerOCrear(ctx.supabase, params.id);

    if (jerarquia[`${body.nivel}_id`] !== ctx.userId) {
      throw ApiError.forbidden("Solo la persona asignada a ese nivel puede autorizarlo");
    }

    const anterior = NIVEL_ANTERIOR[body.nivel];
    if (anterior && !jerarquia[`${anterior}_autorizado_at`]) {
      throw ApiError.conflict(`El nivel anterior (${anterior}) todavía no ha autorizado`);
    }

    const { data, error } = await ctx.supabase
      .from("licitacion_jerarquia")
      .update({ [`${body.nivel}_autorizado_at`]: new Date().toISOString() })
      .eq("licitacion_id", params.id)
      .select("*")
      .single();

    if (error) throw ApiError.internal();

    await ctx.supabase.from("actividad_log").insert({
      licitacion_id: params.id,
      user_id: ctx.userId,
      accion: "autorizacion_jerarquia",
      metadata_json: { nivel: body.nivel },
    });

    return { data };
  },
);
