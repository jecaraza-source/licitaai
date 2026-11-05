import { apiRoute, ApiError } from "@/lib/api";
import { ESTADOS_PENDIENTES_DE_ENVIO } from "@/lib/siguiente-paso";
import type { DashboardUrgentes, LicitacionUrgente } from "@/types";

const MAX_ITEMS = 8;
const DIAS_VENTANA = 7;

// Licitaciones sin enviar cuya entrega vence en los próximos 7 días o ya venció,
// de la más urgente a la menos. La RLS limita el resultado a la organización
// del usuario, igual que el resto del dashboard.
export const GET = apiRoute({}, async ({ ctx }) => {
  const limite = new Date(Date.now() + DIAS_VENTANA * 24 * 60 * 60 * 1000).toISOString();

  const { data, count, error } = await ctx.supabase
    .from("licitaciones")
    .select(
      "id, numero_expediente, titulo, institucion, estado_licitacion, fecha_entrega_propuesta, monto_maximo",
      { count: "exact" },
    )
    .in("estado_licitacion", [...ESTADOS_PENDIENTES_DE_ENVIO])
    // Sin fecha de entrega no hay urgencia que ordenar: `lte` descarta los null.
    .lte("fecha_entrega_propuesta", limite)
    .order("fecha_entrega_propuesta", { ascending: true })
    .limit(MAX_ITEMS);

  if (error) throw ApiError.internal();

  const urgentes: DashboardUrgentes = {
    items: (data ?? []) as LicitacionUrgente[],
    total: count ?? 0,
  };
  return { data: urgentes };
});
