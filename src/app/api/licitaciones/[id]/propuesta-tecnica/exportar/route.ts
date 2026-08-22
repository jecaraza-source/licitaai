import { NextResponse, type NextRequest } from "next/server";
import { Document, HeadingLevel, Packer, Paragraph, TextRun, AlignmentType } from "docx";
import { createClient } from "@/lib/supabase/server";
import { htmlToDocxElements } from "@/lib/html-to-docx";
import { getEmpresaPerfilActiva } from "@/lib/empresa-perfil";

interface Seccion {
  titulo: string;
  html: string;
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { data: licitacion } = await supabase
    .from("licitaciones")
    .select("numero_expediente, titulo, institucion, organization_id")
    .eq("id", id)
    .single();
  if (!licitacion) {
    return NextResponse.json({ error: "Licitación no encontrada" }, { status: 404 });
  }

  const { data: propuesta } = await supabase
    .from("propuestas")
    .select("contenido_json")
    .eq("licitacion_id", id)
    .eq("tipo", "TECNICA")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!propuesta) {
    return NextResponse.json({ error: "No hay propuesta técnica generada" }, { status: 404 });
  }

  const perfil = await getEmpresaPerfilActiva(supabase, licitacion.organization_id, user.id);

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
            children: [new TextRun("Propuesta Técnica")],
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
      "Content-Disposition": `attachment; filename="propuesta-tecnica-${licitacion.numero_expediente}.docx"`,
    },
  });
}
