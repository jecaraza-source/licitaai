import { apiRoute, ApiError } from "@/lib/api";

export const GET = apiRoute({}, async ({ ctx }) => {
  const { data, error } = await ctx.supabase
    .from("referencias_legales")
    .select("id, nombre, nombre_completo, tipo, ambito, descripcion, url_oficial, orden")
    .order("orden");

  if (error) throw ApiError.internal();

  const { data: documentos, error: docsError } = await ctx.supabase
    .from("referencia_legal_documentos")
    .select("referencia_legal_id, procesado");
  if (docsError) throw ApiError.internal();

  const conContenido = new Set(
    (documentos ?? []).filter((d) => d.procesado).map((d) => d.referencia_legal_id),
  );

  return {
    data: (data ?? []).map((r) => ({ ...r, con_contenido: conContenido.has(r.id) })),
  };
});
