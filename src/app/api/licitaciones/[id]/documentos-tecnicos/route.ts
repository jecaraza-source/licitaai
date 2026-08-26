import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getEmpresaPerfilActiva } from "@/lib/empresa-perfil";
import { camposFaltantes, TEC_TITULOS, TIPOS_DOCUMENTO_TECNICO } from "@/lib/documentos-tecnicos";

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
    .select("organization_id, numero_expediente, titulo, institucion, modalidad_procedimiento")
    .eq("id", id)
    .single();
  if (!licitacion) {
    return NextResponse.json({ error: "Licitación no encontrada" }, { status: 404 });
  }

  const empresa = await getEmpresaPerfilActiva(supabase, licitacion.organization_id, user.id, {
    fallbackToFirst: true,
  });

  const documentos = TIPOS_DOCUMENTO_TECNICO.map((tipo) => {
    const faltantes = camposFaltantes(tipo, empresa);
    return { tipo, titulo: TEC_TITULOS[tipo], listo: faltantes.length === 0, faltantes };
  });

  return NextResponse.json({
    data: { documentos, empresaId: empresa?.id ?? null },
  });
}
