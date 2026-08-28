import { z } from "zod";
import { apiRoute } from "@/lib/api";
import { TERMINOS_VERSION } from "@/lib/terminos";

// P2 · I6 — registrar la aceptación de términos del usuario actual.
export const POST = apiRoute(
  { bodySchema: z.object({ version: z.string().optional() }) },
  async ({ ctx, body }) => {
    const version = body.version ?? TERMINOS_VERSION;
    const { error } = await ctx.supabase.rpc("aceptar_terminos", { p_version: version });
    if (error) throw new Error(error.message);
    await ctx.supabase
      .rpc("registrar_auditoria", {
        p_accion: "terminos_aceptados",
        p_recurso_tipo: "usuario",
        p_recurso_id: ctx.userId,
        p_detalle: { version },
      })
      .then(() => {}, () => {});
    return { data: { version, aceptados_at: new Date().toISOString() } };
  },
);
