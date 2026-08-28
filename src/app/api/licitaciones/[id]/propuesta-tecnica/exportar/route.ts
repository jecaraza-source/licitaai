import { NextResponse } from "next/server";
import { z } from "zod";
import { Document, HeadingLevel, Packer, Paragraph, TextRun, AlignmentType } from "docx";
import { apiRoute, ApiError } from "@/lib/api";
import { htmlToDocxElements } from "@/lib/html-to-docx";
import { getEmpresaPerfilActiva } from "@/lib/empresa-perfil";
import { sanitizeFilename } from "@/lib/utils";

interface Seccion {
  titulo: string;
  html: string;
}

const paramsSchema = z.object({ id: z.string().uuid("id debe ser un UUID válido") });
const querySchema = z.object({ anexoA: z.string().optional() });

export const POST = apiRoute({ paramsSchema, querySchema }, async ({ ctx, params, query }) => {
  const comoAnexoA = query.anexoA === "1";

  const { data: licitacion, error } = await ctx.supabase
    .from("licitaciones")
    .select("numero_expediente, titulo, institucion, organization_id")
    .eq("id", params.id)
    .maybeSingle();
  if (error || !licitacion) throw ApiError.notFound("Licitación no encontrada");

  const { data: propuesta } = await ctx.supabase
    .from("propuestas")
    .select("contenido_json")
    .eq("licitacion_id", params.id)
    .eq("tipo", "TECNICA")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!propuesta) throw ApiError.notFound("No hay propuesta técnica generada");

  const perfil = await getEmpresaPerfilActiva(ctx.supabase, licitacion.organization_id, ctx.userId, {
    fallbackToFirst: true,
  });

  const secciones = ((propuesta.contenido_json as { secciones?: Seccion[] })?.secciones ??
    []) as Seccion[];

  const doc = new Document({
    sections: [
      {
        children: [
          ...(perfil?.razon_social
            ? [
                new Paragraph({
                  children: [new TextRun({ text: perfil.razon_social, bold: true, size: 24 })],
                }),
              ]
            : []),
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun(comoAnexoA ? 'ANEXO "A" ESPECIFICACIONES TÉCNICAS' : "Propuesta Técnica"),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({ text: `Expediente: ${licitacion.numero_expediente}`, bold: true }),
            ],
          }),
          new Paragraph({ children: [new TextRun(licitacion.titulo)] }),
          new Paragraph({ children: [new TextRun(licitacion.institucion)] }),
          new Paragraph({ text: "" }),
          ...secciones.flatMap((s) => [
            new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(s.titulo)] }),
            ...htmlToDocxElements(s.html),
            new Paragraph({ text: "" }),
          ]),
        ],
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${comoAnexoA ? "LEG09-anexo-a" : "propuesta-tecnica"}-${sanitizeFilename(licitacion.numero_expediente)}.docx"`,
    },
  });
});
