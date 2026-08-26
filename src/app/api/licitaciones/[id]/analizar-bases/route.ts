import { z } from "zod";
import { apiRoute, ApiError } from "@/lib/api";
import { sendEmail } from "@/lib/resend";
import { AnalisisCompletadoEmail } from "@/emails/analisis-completado";

const paramsSchema = z.object({ id: z.string().uuid("id debe ser un UUID válido") });
const bodySchema = z.object({ documento_id: z.string().uuid().optional() });

export const POST = apiRoute(
  { paramsSchema, bodySchema, rateLimit: { ruta: "analizar-bases" } },
  async ({ ctx, params, body }) => {
    const { data: licitacion, error: licitacionError } = await ctx.supabase
      .from("licitaciones")
      .select("id, numero_expediente, titulo")
      .eq("id", params.id)
      .maybeSingle();

    if (licitacionError) throw ApiError.internal();
    if (!licitacion) throw ApiError.notFound("Licitación no encontrada");

    const { data, error } = await ctx.supabase.functions.invoke("analizar-bases", {
      body: { licitacion_id: params.id, documento_id: body.documento_id },
    });

    if (error) throw ApiError.upstream();

    if (ctx.email) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
      // Fire-and-forget: un fallo al enviar la notificación no debe tumbar
      // una respuesta cuyo análisis ya se generó correctamente.
      sendEmail({
        to: ctx.email,
        subject: `Análisis completado — ${licitacion.numero_expediente}`,
        react: AnalisisCompletadoEmail({
          titulo: licitacion.titulo,
          numeroExpediente: licitacion.numero_expediente,
          nivelConfianza: data?.data?.nivel_confianza ?? "N/D",
          url: `${appUrl}/licitaciones/${params.id}`,
        }),
      }).catch(() => {});
    }

    return { data: data?.data ?? null };
  },
);
