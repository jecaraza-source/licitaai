import { z } from "zod";
import { apiRoute, ApiError, requireRole } from "@/lib/api";
import { sendEmail } from "@/lib/resend";
import { InvitacionStaffEmail } from "@/emails/invitacion-staff";

const bodySchema = z
  .object({
    email: z.string().trim().toLowerCase().email("Correo inválido").max(320),
    rol_jerarquico: z.enum(["EJECUTOR", "INTEGRADOR", "SUPERVISOR"]),
  })
  .strict();

export const POST = apiRoute(
  // Enviar una invitación manda un correo — sin límite es un vector de spam.
  { bodySchema, rateLimit: { ruta: "organizacion-staff-invitar", max: 10 } },
  async ({ ctx, body }) => {
    requireRole(ctx, ["ADMIN"]);

    const { data: organizacion } = await ctx.supabase
      .from("organizations")
      .select("nombre")
      .eq("id", ctx.organizationId)
      .maybeSingle();

    const { data: invitacion, error } = await ctx.supabase
      .from("invitaciones_staff")
      .insert({
        organization_id: ctx.organizationId,
        email: body.email,
        rol_jerarquico: body.rol_jerarquico,
        invitado_por: ctx.userId,
      })
      .select("token")
      .single();

    if (error || !invitacion) throw ApiError.internal();

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    await sendEmail({
      to: body.email,
      subject: `Te invitaron a unirte a ${organizacion?.nombre ?? "una organización"} en LicitaAI`,
      react: InvitacionStaffEmail({
        organizacionNombre: organizacion?.nombre ?? "tu organización",
        rolJerarquico: body.rol_jerarquico,
        url: `${appUrl}/invitacion/${invitacion.token}`,
      }),
    });

    return { data: { ok: true } };
  },
);
