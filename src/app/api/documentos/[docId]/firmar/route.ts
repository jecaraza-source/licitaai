import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { firmarDocumento, parseCertificado } from "@/lib/efirma";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ docId: string }> },
) {
  const { docId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { cer_base64, key_base64, password } = await request.json();
  if (!cer_base64 || !key_base64 || !password) {
    return NextResponse.json(
      { error: "cer_base64, key_base64 y password son requeridos" },
      { status: 400 },
    );
  }

  const { data: documento } = await supabase
    .from("documentos")
    .select("storage_path")
    .eq("id", docId)
    .single();
  if (!documento) {
    return NextResponse.json({ error: "Documento no encontrado" }, { status: 404 });
  }

  let certInfo;
  try {
    certInfo = parseCertificado(cer_base64);
  } catch {
    return NextResponse.json({ error: "No se pudo leer el certificado (.cer)" }, { status: 400 });
  }
  if (!certInfo.vigente) {
    return NextResponse.json({ error: "El certificado no está vigente" }, { status: 400 });
  }

  const { data: archivo, error: downloadError } = await supabase.storage
    .from("documentos-originales")
    .download(documento.storage_path);
  if (downloadError || !archivo) {
    return NextResponse.json({ error: "No se pudo descargar el documento" }, { status: 500 });
  }

  let firma: string;
  try {
    firma = firmarDocumento(key_base64, password, await archivo.arrayBuffer());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo firmar el documento" },
      { status: 400 },
    );
  }

  const firmaDigitalJson = {
    firmado_por: certInfo.nombre_comun,
    rfc: certInfo.rfc,
    numero_serie: certInfo.numero_serie,
    firmado_at: new Date().toISOString(),
    algoritmo: "RSA-SHA256",
    firma_base64: firma,
    tipo: "interna",
  };

  const { data, error } = await supabase
    .from("documentos")
    .update({ firma_digital_json: firmaDigitalJson })
    .eq("id", docId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabase.from("actividad_log").insert({
    licitacion_id: data.licitacion_id,
    user_id: user.id,
    accion: "documento_firmado",
    metadata_json: { documento_id: docId, rfc: certInfo.rfc },
  });

  return NextResponse.json({ data });
}
