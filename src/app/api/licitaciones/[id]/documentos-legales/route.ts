import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getEmpresaPerfilActiva } from "@/lib/empresa-perfil";
import { camposFaltantes, LEG_TITULOS, TIPOS_DOCUMENTO_LEGAL } from "@/lib/documentos-legales";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
    .select(
      "organization_id, numero_expediente, titulo, institucion, modalidad_procedimiento, convocante_representante_nombre, convocante_representante_cargo",
    )
    .eq("id", id)
    .single();
  if (!licitacion) {
    return NextResponse.json({ error: "Licitación no encontrada" }, { status: 404 });
  }

  const empresa = await getEmpresaPerfilActiva(supabase, licitacion.organization_id, user.id, {
    fallbackToFirst: true,
  });

  const documentos = TIPOS_DOCUMENTO_LEGAL.map((tipo) => {
    const faltantes = camposFaltantes(tipo, empresa, licitacion);
    return { tipo, titulo: LEG_TITULOS[tipo], listo: faltantes.length === 0, faltantes };
  });

  return NextResponse.json({
    data: {
      documentos,
      empresaId: empresa?.id ?? null,
      convocanteRepresentanteNombre: licitacion.convocante_representante_nombre,
      convocanteRepresentanteCargo: licitacion.convocante_representante_cargo,
    },
  });
}
