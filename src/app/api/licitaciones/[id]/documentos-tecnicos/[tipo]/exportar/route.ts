import { NextResponse, type NextRequest } from "next/server";
import { Packer } from "docx";
import { createClient } from "@/lib/supabase/server";
import { getEmpresaPerfilActiva } from "@/lib/empresa-perfil";
import { sanitizeFilename } from "@/lib/utils";
import {
  camposFaltantes,
  generarDocumentoTecnico,
  TIPOS_DOCUMENTO_TECNICO,
  type TipoDocumentoTecnico,
} from "@/lib/documentos-tecnicos";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; tipo: string }> },
) {
  const { id, tipo } = await params;
  if (!TIPOS_DOCUMENTO_TECNICO.includes(tipo as TipoDocumentoTecnico)) {
    return NextResponse.json({ error: "Tipo de documento no válido" }, { status: 400 });
  }
  const tipoTecnico = tipo as TipoDocumentoTecnico;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { data: licitacion } = await supabase
    .from("licitaciones")
    .select("numero_expediente, titulo, institucion, modalidad_procedimiento, organization_id")
    .eq("id", id)
    .single();
  if (!licitacion) {
    return NextResponse.json({ error: "Licitación no encontrada" }, { status: 404 });
  }

  const empresa = await getEmpresaPerfilActiva(supabase, licitacion.organization_id, user.id, {
    fallbackToFirst: true,
  });

  const faltantes = camposFaltantes(tipoTecnico, empresa);
  if (!empresa || faltantes.length > 0) {
    return NextResponse.json(
      { error: "Faltan datos técnicos de la empresa para generar este documento", faltantes },
      { status: 400 },
    );
  }

  const documento = generarDocumentoTecnico(tipoTecnico, {
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
      "Content-Disposition": `attachment; filename="${tipoTecnico}-${sanitizeFilename(licitacion.numero_expediente)}.docx"`,
    },
  });
}
