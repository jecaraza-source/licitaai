import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

const NIVELES = ["ejecutor", "integrador", "supervisor"] as const;
type Nivel = (typeof NIVELES)[number];

const NIVEL_ANTERIOR: Record<Nivel, Nivel | null> = {
  ejecutor: null,
  integrador: "ejecutor",
  supervisor: "integrador",
};

const VACIA = {
  id: null,
  ejecutor_id: null,
  integrador_id: null,
  supervisor_id: null,
  ejecutor_autorizado_at: null,
  integrador_autorizado_at: null,
  supervisor_autorizado_at: null,
};

// Solo crea la fila cuando hace falta escribir en ella (asignar/autorizar).
// El GET nunca inserta — así un usuario de solo lectura (VIEWER) puede ver
// la cadena vacía sin chocar con la política de escritura de la tabla.
async function obtenerOCrear(supabase: Awaited<ReturnType<typeof createClient>>, licitacionId: string) {
  const { data: existente } = await supabase
    .from("licitacion_jerarquia")
    .select("*")
    .eq("licitacion_id", licitacionId)
    .maybeSingle();

  if (existente) return existente;

  const { data: creado, error } = await supabase
    .from("licitacion_jerarquia")
    .insert({ licitacion_id: licitacionId })
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return creado;
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
    .from("licitacion_jerarquia")
    .select("*")
    .eq("licitacion_id", id)
    .maybeSingle();

  return NextResponse.json({ data: existente ?? { ...VACIA, licitacion_id: id }, userId: user.id });
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

  const { nivel, usuario_id } = await request.json();
  if (!NIVELES.includes(nivel)) {
    return NextResponse.json({ error: "nivel inválido" }, { status: 400 });
  }

  if (usuario_id) {
    const { data: usuarioAsignado } = await supabase
      .from("users")
      .select("rol_jerarquico")
      .eq("id", usuario_id)
      .single();
    if (usuarioAsignado?.rol_jerarquico !== nivel.toUpperCase()) {
      return NextResponse.json(
        { error: `Esa persona no tiene el rango de ${nivel} asignado en Configuración` },
        { status: 400 },
      );
    }
  }

  await obtenerOCrear(supabase, id);

  // Reasignar un nivel invalida su autorización y la de los niveles
  // posteriores en la cadena — la autorización dada era para la persona
  // anterior, no para quien entra ahora.
  const patch: Record<string, unknown> = { [`${nivel}_id`]: usuario_id || null };
  const idxNivel = NIVELES.indexOf(nivel as Nivel);
  for (let i = idxNivel; i < NIVELES.length; i++) {
    patch[`${NIVELES[i]}_autorizado_at`] = null;
  }

  const { data, error } = await supabase
    .from("licitacion_jerarquia")
    .update(patch)
    .eq("licitacion_id", id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(
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

  const { nivel } = await request.json();
  if (!NIVELES.includes(nivel)) {
    return NextResponse.json({ error: "nivel inválido" }, { status: 400 });
  }

  const jerarquia = await obtenerOCrear(supabase, id);
  const nivelTyped = nivel as Nivel;

  if (jerarquia[`${nivelTyped}_id`] !== user.id) {
    return NextResponse.json(
      { error: "Solo la persona asignada a ese nivel puede autorizarlo" },
      { status: 403 },
    );
  }

  const anterior = NIVEL_ANTERIOR[nivelTyped];
  if (anterior && !jerarquia[`${anterior}_autorizado_at`]) {
    return NextResponse.json(
      { error: `El nivel anterior (${anterior}) todavía no ha autorizado` },
      { status: 409 },
    );
  }

  const { data, error } = await supabase
    .from("licitacion_jerarquia")
    .update({ [`${nivelTyped}_autorizado_at`]: new Date().toISOString() })
    .eq("licitacion_id", id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabase.from("actividad_log").insert({
    licitacion_id: id,
    user_id: user.id,
    accion: "autorizacion_jerarquia",
    metadata_json: { nivel: nivelTyped },
  });

  return NextResponse.json({ data });
}
