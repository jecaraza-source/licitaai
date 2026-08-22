import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

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

  const [{ data: config }, { data: partidasEconomicas }, { data: partidas }, { data: estudios }] =
    await Promise.all([
      supabase
        .from("propuesta_economica_config")
        .select("*")
        .eq("licitacion_id", id)
        .maybeSingle(),
      supabase.from("propuesta_economica_partidas").select("*").eq("licitacion_id", id),
      supabase.from("partidas").select("*").eq("licitacion_id", id).order("numero"),
      supabase.from("estudio_mercado").select("*").eq("licitacion_id", id),
    ]);

  // Si aún no hay renglones de propuesta económica, se inicializan desde las
  // partidas detectadas (con el precio de referencia del estudio de mercado).
  let filas = partidasEconomicas ?? [];
  if (filas.length === 0 && partidas && partidas.length > 0) {
    const estudiosPorPartida = new Map((estudios ?? []).map((e) => [e.partida_id, e]));
    filas = partidas.map((p) => {
      const estudio = estudiosPorPartida.get(p.id);
      const referencia = estudio?.precio_recomendado ?? p.precio_unitario_referencia ?? null;
      return {
        id: crypto.randomUUID(),
        licitacion_id: id,
        partida_id: p.id,
        descripcion: p.descripcion,
        cantidad: p.cantidad,
        unidad: p.unidad,
        precio_unitario_ofertado: null,
        subtotal: null,
        iva: null,
        total: null,
        margen_porcentaje: null,
        precio_referencia_mercado: referencia,
        _nueva: true,
      };
    });
  }

  return NextResponse.json({
    data: {
      config: config ?? {
        tipo_precio: null,
        incluye_iva: true,
        moneda: "MXN",
        condiciones_pago: null,
        tiempo_entrega_dias: null,
        validez_oferta_dias: null,
      },
      partidas: filas,
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
  const { config, partidas } = body as {
    config?: Record<string, unknown>;
    partidas?: Record<string, unknown>[];
  };

  if (config) {
    const { data: existente } = await supabase
      .from("propuesta_economica_config")
      .select("id")
      .eq("licitacion_id", id)
      .maybeSingle();

    if (existente) {
      await supabase.from("propuesta_economica_config").update(config).eq("id", existente.id);
    } else {
      await supabase
        .from("propuesta_economica_config")
        .insert({ licitacion_id: id, ...config });
    }
  }

  if (Array.isArray(partidas)) {
    await supabase.from("propuesta_economica_partidas").delete().eq("licitacion_id", id);
    if (partidas.length > 0) {
      const filas = partidas.map((p) => ({
        licitacion_id: id,
        partida_id: p.partida_id ?? null,
        descripcion: p.descripcion,
        cantidad: p.cantidad,
        unidad: p.unidad,
        precio_unitario_ofertado: p.precio_unitario_ofertado,
        subtotal: p.subtotal,
        iva: p.iva,
        total: p.total,
        margen_porcentaje: p.margen_porcentaje,
        precio_referencia_mercado: p.precio_referencia_mercado,
      }));
      const { error } = await supabase.from("propuesta_economica_partidas").insert(filas);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
