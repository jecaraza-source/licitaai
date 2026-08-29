import { z } from "zod";
import JSZip from "jszip";
import { NextResponse } from "next/server";
import { Packer } from "docx";
import { apiRoute, ApiError } from "@/lib/api";
import { getEmpresaPerfilActiva } from "@/lib/empresa-perfil";
import { sanitizeFilename } from "@/lib/utils";
import {
  camposFaltantes,
  generarDocumentoLegal,
  LEG_TITULOS,
  TIPOS_DOCUMENTO_LEGAL,
} from "@/lib/documentos-legales";

const paramsSchema = z.object({ id: z.string().uuid("id debe ser un UUID válido") });

// (Re)genera de una sola vez todos los documentos legales que ya tengan sus
// datos completos — el botón "Generar documentos listos" de la pestaña.
// Cada .docx se arma al vuelo con los datos actuales de la empresa y la
// licitación (igual que el export individual), así que nunca queda un
// documento desactualizado: basta con volver a pulsar el botón conforme se
// van completando datos en Configuración o subiendo documentos fuente.
export const GET = apiRoute({ paramsSchema }, async ({ ctx, params }) => {
  const { data: licitacion, error } = await ctx.supabase
    .from("licitaciones")
    .select(
      "numero_expediente, titulo, institucion, modalidad_procedimiento, organization_id, convocante_representante_nombre, convocante_representante_cargo",
    )
    .eq("id", params.id)
    .maybeSingle();

  if (error || !licitacion) throw ApiError.notFound("Licitación no encontrada");

  const empresa = await getEmpresaPerfilActiva(ctx.supabase, licitacion.organization_id, ctx.userId, {
    fallbackToFirst: true,
  });

  const licitacionParaDocumento = {
    numero_expediente: licitacion.numero_expediente,
    titulo: licitacion.titulo,
    institucion: licitacion.institucion,
    modalidad_procedimiento: licitacion.modalidad_procedimiento,
    convocante_representante_nombre: licitacion.convocante_representante_nombre,
    convocante_representante_cargo: licitacion.convocante_representante_cargo,
  };

  const listos = TIPOS_DOCUMENTO_LEGAL.filter(
    (tipo) => empresa && camposFaltantes(tipo, empresa, licitacionParaDocumento).length === 0,
  );

  if (listos.length === 0) {
    throw ApiError.validation(
      "Todavía no hay datos suficientes para generar ningún documento legal",
    );
  }

  const zip = new JSZip();
  for (const tipo of listos) {
    const documento = generarDocumentoLegal(tipo, { empresa: empresa!, licitacion: licitacionParaDocumento });
    const buffer = await Packer.toBuffer(documento);
    zip.file(`${tipo}-${sanitizeFilename(LEG_TITULOS[tipo])}.docx`, buffer);
  }
  const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });

  return new NextResponse(new Uint8Array(zipBuffer), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="documentos-legales-${sanitizeFilename(licitacion.numero_expediente)}.zip"`,
    },
  });
});
