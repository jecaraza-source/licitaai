import { z } from "zod";
import { apiRoute, ApiError } from "@/lib/api";
import { getEmpresaPerfilActiva } from "@/lib/empresa-perfil";
import { camposFaltantes, LEG_TITULOS, TIPOS_DOCUMENTO_LEGAL } from "@/lib/documentos-legales";

const paramsSchema = z.object({ id: z.string().uuid("id debe ser un UUID válido") });

export const GET = apiRoute({ paramsSchema }, async ({ ctx, params }) => {
  const { data: licitacion, error } = await ctx.supabase
    .from("licitaciones")
    .select(
      "organization_id, numero_expediente, titulo, institucion, modalidad_procedimiento, convocante_representante_nombre, convocante_representante_cargo",
    )
    .eq("id", params.id)
    .maybeSingle();

  // Colapsa cualquier error de consulta a "no encontrada" en vez de
  // distinguirlo — mismo comportamiento defensivo que el código original
  // (no revela si el fallo fue por RLS, conexión, o ausencia real de fila).
  if (error || !licitacion) throw ApiError.notFound("Licitación no encontrada");

  const empresa = await getEmpresaPerfilActiva(ctx.supabase, licitacion.organization_id, ctx.userId, {
    fallbackToFirst: true,
  });

  const documentos = TIPOS_DOCUMENTO_LEGAL.map((tipo) => {
    const faltantes = camposFaltantes(tipo, empresa, licitacion);
    return { tipo, titulo: LEG_TITULOS[tipo], listo: faltantes.length === 0, faltantes };
  });

  return {
    data: {
      documentos,
      empresaId: empresa?.id ?? null,
      convocanteRepresentanteNombre: licitacion.convocante_representante_nombre,
      convocanteRepresentanteCargo: licitacion.convocante_representante_cargo,
    },
  };
});
