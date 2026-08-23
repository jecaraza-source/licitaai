import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { EjeViabilidad, RespuestaViabilidad } from "@/types";

const EJES: EjeViabilidad[] = [
  "JURIDICO",
  "TECNICO",
  "EXPERIENCIA",
  "PERSONAL",
  "CERTIFICACIONES",
  "COMERCIAL",
  "LOGISTICO",
  "FINANCIERO",
  "ECONOMICO",
];

function buildRespuestas(existentes: RespuestaViabilidad[] = []): RespuestaViabilidad[] {
  const previas = new Map(existentes.map((r) => [r.eje, r]));
  return EJES.map(
    (eje) => previas.get(eje) ?? { eje, respuesta: null, comentario: "" },
  );
}

export async function GET(
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

  const { data: existente } = await supabase
    .from("viabilidad")
    .select("*")
    .eq("licitacion_id", id)
    .maybeSingle();

  return NextResponse.json({
    data: {
      respuestas_json: buildRespuestas(existente?.respuestas_json ?? []),
      decision: existente?.decision ?? null,
      decidido_at: existente?.decidido_at ?? null,
    },
  });
}

export async function PUT(
  request: NextRequest,
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

  const body = await request.json();
  const respuestas = buildRespuestas(body.respuestas_json ?? []);
  const decision = body.decision === "GO" || body.decision === "NO_GO" ? body.decision : null;

  const update: Record<string, unknown> = {
    licitacion_id: id,
    respuestas_json: respuestas,
    decision,
  };
  if (decision) {
    update.decidido_por = user.id;
    update.decidido_at = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from("viabilidad")
    .upsert(update, { onConflict: "licitacion_id" })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
