import { z } from "zod";
import { apiRoute, ApiError } from "@/lib/api";
import { SELECT_DETALLE, aDetalle, type FilaCorreoConJoins } from "@/app/api/correos/compartido";

const paramsSchema = z.object({ id: z.string().uuid("id debe ser un UUID válido") });

// Correos de Compras MX asociados a una licitación (con su cuerpo), del más
// reciente al más antiguo: el historial de comunicaciones del procedimiento.
export const GET = apiRoute({ paramsSchema }, async ({ ctx, params }) => {
  const { data, error } = await ctx.supabase
    .from("correos_compras_mx")
    .select(SELECT_DETALLE)
    .eq("licitacion_id", params.id)
    .eq("estado", "ASOCIADO")
    .order("recibido_en", { ascending: false })
    .limit(100);
  if (error) throw ApiError.internal();
  return { data: ((data ?? []) as unknown as FilaCorreoConJoins[]).map(aDetalle) };
});
