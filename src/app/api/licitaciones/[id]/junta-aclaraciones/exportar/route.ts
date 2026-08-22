import { NextResponse, type NextRequest } from "next/server";
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from "docx";
import { createClient } from "@/lib/supabase/server";
import { getEmpresaPerfilActiva } from "@/lib/empresa-perfil";

interface Pregunta {
  texto: string;
  categoria: string;
  fundamento_legal?: string | null;
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

  const { data: junta } = await supabase
    .from("junta_aclaraciones")
    .select("preguntas_json")
    .eq("licitacion_id", id)
    .maybeSingle();

  const perfil = await getEmpresaPerfilActiva(supabase, licitacion.organization_id, user.id);

  const preguntas = (junta?.preguntas_json ?? []) as Pregunta[];

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
            children: [new TextRun("Preguntas para la Junta de Aclaraciones")],
          }),
          new Paragraph({
            children: [
              new TextRun({ text: `Expediente: ${licitacion.numero_expediente}`, bold: true }),
            ],
          }),
          new Paragraph({ children: [new TextRun(licitacion.titulo)] }),
          new Paragraph({ children: [new TextRun(licitacion.institucion)] }),
          new Paragraph({ text: "" }),
          ...preguntas.flatMap((p, i) => [
            new Paragraph({
              children: [
                new TextRun({ text: `${i + 1}. `, bold: true }),
                new TextRun({ text: p.texto }),
              ],
            }),
            new Paragraph({
              children: [
                new TextRun({
                  text: `[${p.categoria}]${p.fundamento_legal ? ` — ${p.fundamento_legal}` : ""}`,
                  italics: true,
                  size: 18,
                  color: "666666",
                }),
              ],
            }),
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
      "Content-Disposition": `attachment; filename="junta-aclaraciones-${licitacion.numero_expediente}.docx"`,
    },
  });
}
