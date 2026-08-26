import { z } from "zod";
import { apiRoute, ApiError, requireWriteRole } from "@/lib/api";
import {
  licitacionSchema,
  ESTADOS_LICITACION,
  TIPOS_LICITACION,
  ESTADOS_ID,
} from "@/lib/validations/licitacion";
import { getEmpresaPerfilActiva } from "@/lib/empresa-perfil";
import { TIPOS_DOCUMENTO_CORPORATIVO } from "@/lib/documentos-corporativos";

// El escapado evita que un `search` con `,`/`(`/`)` altere la expresión de
// filtro combinado que PostgREST recibe en `.or()` — antes, esos caracteres
// se interpolaban sin escapar y podían cambiar qué condiciones se evalúan.
function escaparValorOr(valor: string): string {
  return valor.replace(/\\/g, "\\\\").replace(/,/g, "\\,").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

const listQuerySchema = z.object({
  page: z.coerce.number().int().optional().default(1).transform((v) => Math.max(1, v)),
  pageSize: z.coerce
    .number()
    .int()
    .optional()
    .default(20)
    .transform((v) => Math.min(100, Math.max(1, v))),
  estado_licitacion: z.enum(ESTADOS_LICITACION).optional(),
  tipo: z.enum(TIPOS_LICITACION).optional(),
  estado_id: z.enum(ESTADOS_ID).optional(),
  search: z.string().trim().max(200).optional(),
});

export const GET = apiRoute({ querySchema: listQuerySchema }, async ({ ctx, query }) => {
  const { page, pageSize, estado_licitacion, tipo, estado_id, search } = query;

  let dbQuery = ctx.supabase
    .from("licitaciones")
    .select("*, analisis_bases(objeto_contrato)", { count: "exact" })
    .order("created_at", { ascending: false });

  if (estado_licitacion) dbQuery = dbQuery.eq("estado_licitacion", estado_licitacion);
  if (tipo) dbQuery = dbQuery.eq("tipo", tipo);
  if (estado_id) dbQuery = dbQuery.eq("estado_id", estado_id);
  if (search) {
    const s = escaparValorOr(search);
    dbQuery = dbQuery.or(`numero_expediente.ilike.%${s}%,titulo.ilike.%${s}%,institucion.ilike.%${s}%`);
  }

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const { data, error, count } = await dbQuery.range(from, to);

  if (error) throw ApiError.internal();

  const licitacionIds = (data ?? []).map((l) => l.id);

  const [{ data: checklistItems }, { data: perfil }] = await Promise.all([
    licitacionIds.length > 0
      ? ctx.supabase
          .from("checklist_items")
          .select("licitacion_id, requerido, estado")
          .in("licitacion_id", licitacionIds)
      : Promise.resolve({ data: [] as { licitacion_id: string; requerido: boolean; estado: string }[] }),
    ctx.supabase.from("users").select("organization_id").eq("id", ctx.userId).single(),
  ]);

  const dataConScore = (data ?? []).map((licitacion) => {
    const requeridos = (checklistItems ?? []).filter(
      (i) => i.licitacion_id === licitacion.id && i.requerido,
    );
    const completos = requeridos.filter((i) => i.estado === "VERDE" || i.estado === "GRIS");
    const checklist_score =
      requeridos.length > 0 ? Math.round((completos.length / requeridos.length) * 100) : 0;
    return { ...licitacion, checklist_score };
  });

  let empresaScore: number | null = null;
  if (perfil?.organization_id) {
    const empresaActiva = await getEmpresaPerfilActiva(ctx.supabase, perfil.organization_id, ctx.userId);
    if (empresaActiva) {
      const { data: docsCorporativos } = await ctx.supabase
        .from("documentos_corporativos")
        .select("tipo")
        .eq("empresa_perfil_id", empresaActiva.id);

      const tiposRequeridos = TIPOS_DOCUMENTO_CORPORATIVO.filter((t) => t !== "Otro");
      const cubiertos = new Set([
        ...(docsCorporativos ?? []).map((d) => d.tipo),
        ...(empresaActiva.documentos_no_aplican ?? []),
      ]);
      const completos = tiposRequeridos.filter((t) => cubiertos.has(t)).length;
      empresaScore =
        tiposRequeridos.length > 0 ? Math.round((completos / tiposRequeridos.length) * 100) : 100;
    }
  }

  return { data: { data: dataConScore, count, page, pageSize, empresaScore } };
});

export const POST = apiRoute({ bodySchema: licitacionSchema }, async ({ ctx, body }) => {
  requireWriteRole(ctx);

  const { data, error } = await ctx.supabase
    .from("licitaciones")
    .insert({ ...body, organization_id: ctx.organizationId, created_by: ctx.userId })
    .select()
    .single();

  if (error) throw ApiError.internal();

  // Fallos aquí (plantillas de checklist, log de actividad) no revierten la
  // creación de la licitación — mismo comportamiento "best effort" que
  // tenía el código original; restructurar esto en una operación atómica es
  // alcance de P1.2, no de esta migración.
  const { data: plantillas } = await ctx.supabase
    .from("checklist_templates")
    .select("categoria, descripcion, fundamento_legal, vigencia_requerida, formato_aceptado, requerido")
    .eq("estado_id", data.estado_id);

  if (plantillas && plantillas.length > 0) {
    await ctx.supabase.from("checklist_items").insert(
      plantillas.map((p) => ({ ...p, licitacion_id: data.id })),
    );
  }

  await ctx.supabase.from("actividad_log").insert({
    licitacion_id: data.id,
    user_id: ctx.userId,
    accion: "creacion",
    metadata_json: { titulo: data.titulo },
  });

  return { data };
});
