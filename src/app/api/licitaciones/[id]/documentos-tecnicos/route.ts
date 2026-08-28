import { z } from "zod";
import { apiRoute, ApiError } from "@/lib/api";
import { getEmpresaPerfilActiva } from "@/lib/empresa-perfil";
import { camposFaltantes, TEC_TITULOS, TIPOS_DOCUMENTO_TECNICO } from "@/lib/documentos-tecnicos";

const paramsSchema = z.object({ id: z.string().uuid("id debe ser un UUID válido") });

export const GET = apiRoute({ paramsSchema }, async ({ ctx, params }) => {
  const { data: licitacion, error } = await ctx.supabase
    .from("licitaciones")
    .select("organization_id, numero_expediente, titulo, institucion, modalidad_procedimiento")
    .eq("id", params.id)
    .maybeSingle();

  if (error || !licitacion) throw ApiError.notFound("Licitación no encontrada");

  const empresa = await getEmpresaPerfilActiva(ctx.supabase, licitacion.organization_id, ctx.userId, {
    fallbackToFirst: true,
  });

  const documentos = TIPOS_DOCUMENTO_TECNICO.map((tipo) => {
    const faltantes = camposFaltantes(tipo, empresa);
    return { tipo, titulo: TEC_TITULOS[tipo], listo: faltantes.length === 0, faltantes };
  });

  return { data: { documentos, empresaId: empresa?.id ?? null } };
});
