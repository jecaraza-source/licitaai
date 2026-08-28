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

  // P1.2 — orden seguro: primero se borra la fila de la base (la fuente de
  // verdad de qué documentos existen). Solo si eso tuvo éxito se borra el
  // objeto de Storage. Si el borrado de Storage falla, la fila ya no está
  // (el usuario ve el documento como eliminado) y queda un objeto huérfano
  // que el barrido de archivos huérfanos recoge después — se registra para
  // trazabilidad en vez de fallar la operación.
  const { error } = await ctx.supabase
    .from("documentos_corporativos")
    .delete()
    .eq("id", params.docId);
  if (error) throw ApiError.internal();

  const { error: storageError } = await ctx.supabase.storage
    .from("documentos-corporativos")
    .remove([doc.storage_path]);
  if (storageError) {
    console.error(
      "[api] documento_corporativo borrado de la base pero no de Storage:",
      JSON.stringify({ request_id: ctx.requestId, storage_path: doc.storage_path }),
    );
  }

  return { data: { ok: true } };
});
