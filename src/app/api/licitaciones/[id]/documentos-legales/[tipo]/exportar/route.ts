import { NextResponse, type NextRequest } from "next/server";
import { Packer } from "docx";
import { createClient } from "@/lib/supabase/server";
import { getEmpresaPerfilActiva } from "@/lib/empresa-perfil";
import { sanitizeFilename } from "@/lib/utils";
import {
  camposFaltantes,
  generarDocumentoLegal,
  TIPOS_DOCUMENTO_LEGAL,
  type TipoDocumentoLegal,
} from "@/lib/documentos-legales";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; tipo: string }> },
) {
  const { id, tipo } = await params;
  if (!TIPOS_DOCUMENTO_LEGAL.includes(tipo as TipoDocumentoLegal)) {
    return NextResponse.json({ error: "Tipo de documento no válido" }, { status: 400 });
  }
  const tipoLegal = tipo as TipoDocumentoLegal;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { data: licitacion } = await supabase
    .from("licitaciones")
    .select(
      "numero_expediente, titulo, institucion, modalidad_procedimiento, organization_id, convocante_representante_nombre, convocante_representante_cargo",
    )
    .eq("id", id)
    .single();
  if (!licitacion) {
    return NextResponse.json({ error: "Licitación no encontrada" }, { status: 404 });
  }

  const empresa = await getEmpresaPerfilActiva(supabase, licitacion.organization_id, user.id, {
    fallbackToFirst: true,
  });

  const faltantes = camposFaltantes(tipoLegal, empresa, licitacion);
  if (!empresa || faltantes.length > 0) {
    return NextResponse.json(
      { error: "Faltan datos legales de la empresa para generar este documento", faltantes },
      { status: 400 },
    );
  }

  const documento = generarDocumentoLegal(tipoLegal, {
    empresa,
    licitacion: {
      numero_expediente: licitacion.numero_expediente,
      titulo: licitacion.titulo,
      institucion: licitacion.institucion,
      modalidad_procedimiento: licitacion.modalidad_procedimiento,
      convocante_representante_nombre: licitacion.convocante_representante_nombre,
      convocante_representante_cargo: licitacion.convocante_representante_cargo,
    },
  });

  const buffer = await Packer.toBuffer(documento);

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${tipoLegal}-${sanitizeFilename(licitacion.numero_expediente)}.docx"`,
    },
  });
}
