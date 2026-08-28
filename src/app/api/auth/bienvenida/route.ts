import { z } from "zod";
import { apiRoute, ApiError } from "@/lib/api";
import { sendEmail } from "@/lib/resend";
import { BienvenidaEmail } from "@/emails/bienvenida";

const bodySchema = z
  .object({
    email: z.string().trim().email().max(320),
    nombre: z.string().trim().max(300).optional(),
  })
  .strict();

export const POST = apiRoute({ bodySchema }, async ({ ctx, body }) => {
  // Solo se envía si la sesión real corresponde a ese correo — evita que
  // este endpoint se use como relay de spam hacia direcciones arbitrarias.
  if (ctx.email.toLowerCase() !== body.email.toLowerCase()) {
    throw ApiError.forbidden("No autorizado");
  }

  await sendEmail({
    to: body.email,
    subject: "Bienvenido a LicitaAI",
    react: BienvenidaEmail({ nombre: body.nombre || body.email }),
  });

  return { data: { ok: true } };
});
