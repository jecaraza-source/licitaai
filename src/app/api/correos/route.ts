import { z } from "zod";
import { apiRoute, ApiError } from "@/lib/api";
import {
  ESTADOS_CORREO,
  direccionDeEntrada,
  type BandejaCorreos,
  type EstadoCorreo,
} from "@/lib/correos-compras-mx";
import { SELECT_RESUMEN, aResumen, type FilaCorreoConJoins } from "./compartido";

const querySchema = z.object({
  estado: z.enum(ESTADOS_CORREO).optional().default("PENDIENTE"),
  page: z.coerce.number().int().optional().default(1).transform((v) => Math.max(1, v)),
  pageSize: z.coerce
    .number()
    .int()
    .optional()
    .default(25)
    .transform((v) => Math.min(100, Math.max(1, v))),
});

// Bandeja de correos de Compras MX de la empresa del usuario (RLS limita a su
// organización). La lista no trae el cuerpo: se pide al abrir cada correo.
export const GET = apiRoute({ querySchema }, async ({ ctx, query }) => {
  const { estado, page, pageSize } = query;
  const from = (page - 1) * pageSize;

  const [lista, org, ...conteos] = await Promise.all([
    ctx.supabase
      .from("correos_compras_mx")
      .select(SELECT_RESUMEN, { count: "exact" })
      .eq("estado", estado)
      .order("recibido_en", { ascending: false })
      .range(from, from + pageSize - 1),
    ctx.supabase.from("organizations").select("alias_correo").eq("id", ctx.organizationId).maybeSingle(),
    ...ESTADOS_CORREO.map((e) =>
      ctx.supabase.from("correos_compras_mx").select("id", { count: "exact", head: true }).eq("estado", e),
    ),
  ]);

  if (lista.error) throw ApiError.internal();

  const dominio = process.env.CORREO_ENTRADA_DOMINIO;
  const direccion = dominio && org.data?.alias_correo ? direccionDeEntrada(org.data.alias_correo, dominio) : null;

  const respuesta: BandejaCorreos = {
    items: ((lista.data ?? []) as unknown as FilaCorreoConJoins[]).map(aResumen),
    total: lista.count ?? 0,
    conteos: Object.fromEntries(ESTADOS_CORREO.map((e, i) => [e, conteos[i].count ?? 0])) as Record<EstadoCorreo, number>,
    direccion,
  };
  return { data: respuesta };
});
