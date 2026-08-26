import { z } from "zod";
import { apiRoute, ApiError, requireWriteRole } from "@/lib/api";

const paramsSchema = z.object({
  id: z.string().uuid("id debe ser un UUID válido"),
  docId: z.string().uuid("docId debe ser un UUID válido"),
});

export const DELETE = apiRoute({ paramsSchema }, async ({ ctx, params }) => {
  requireWriteRole(ctx);

  // Antes, docId se buscaba sin comparar contra `id` (empresa_perfil) en la
  // URL — un docId de OTRO perfil de empresa de la misma organización
  // pasaba el chequeo igual. Ahora se exige que pertenezca al perfil de la
  // URL antes de borrar nada.
  const { data: doc } = await ctx.supabase
    .from("documentos_corporativos")
    .select("storage_path")
    .eq("id", params.docId)
    .eq("empresa_perfil_id", params.id)
    .maybeSingle();

  if (!doc) throw ApiError.notFound("Documento no encontrado");

  // Storage.remove() sin comprobar error y el orden Storage-antes-que-DB
  // quedan igual que el código original — corregir esa compensación es
  // alcance de P1.2, no de esta migración.
  await ctx.supabase.storage.from("documentos-corporativos").remove([doc.storage_path]);

  const { error } = await ctx.supabase.from("documentos_corporativos").delete().eq("id", params.docId);
  if (error) throw ApiError.internal();

  return { data: { ok: true } };
});
