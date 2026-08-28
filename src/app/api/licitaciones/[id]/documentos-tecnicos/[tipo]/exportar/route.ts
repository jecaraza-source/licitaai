import { z } from "zod";
import { NextResponse } from "next/server";
import { Packer } from "docx";
import { apiRoute, ApiError } from "@/lib/api";
import { getEmpresaPerfilActiva } from "@/lib/empresa-perfil";
import { sanitizeFilename } from "@/lib/utils";
import { camposFaltantes, generarDocumentoTecnico, TIPOS_DOCUMENTO_TECNICO } from "@/lib/documentos-tecnicos";

const paramsSchema = z.object({
  id: z.string().uuid("id debe ser un UUID válido"),
  tipo: z.enum(TIPOS_DOCUMENTO_TECNICO),
});

export const GET = apiRoute({ paramsSchema }, async ({ ctx, params }) => {
  const { data: licitacion, error } = await ctx.supabase
    .from("licitaciones")
    .select("numero_expediente, titulo, institucion, modalidad_procedimiento, organization_id")
    .eq("id", params.id)
    .maybeSingle();

  if (error || !licitacion) throw ApiError.notFound("Licitación no encontrada");

  const empresa = await getEmpresaPerfilActiva(ctx.supabase, licitacion.organization_id, ctx.userId, {
    fallbackToFirst: true,
  });

  const faltantes = camposFaltantes(params.tipo, empresa);
  if (!empresa || faltantes.length > 0) {
    throw ApiError.validation("Faltan datos técnicos de la empresa para generar este documento", {
      faltantes,
    });
  }

  const documento = generarDocumentoTecnico(params.tipo, {
    empresa,
    licitacion: {
      numero_expediente: licitacion.numero_expediente,
      titulo: licitacion.titulo,
      institucion: licitacion.institucion,
      modalidad_procedimiento: licitacion.modalidad_procedimiento,
    },
  });

  const buffer = await Packer.toBuffer(documento);

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${params.tipo}-${sanitizeFilename(licitacion.numero_expediente)}.docx"`,
    },
  });
});
