import { Resend } from "resend";

// "onboarding@resend.dev" es el remitente de pruebas de Resend — funciona sin
// verificar un dominio propio. Para producción, verifica un dominio en
// resend.com/domains y cambia esto a algo como "LicitaAI <notificaciones@tu-dominio.com>".
const FROM = process.env.RESEND_FROM_EMAIL || "LicitaAI <onboarding@resend.dev>";

/**
 * Envía un correo vía Resend. Sin RESEND_API_KEY configurada, no envía nada
 * y solo registra un aviso — no rompe el flujo que lo dispara.
 */
export async function sendEmail(params: {
  to: string;
  subject: string;
  react: React.ReactElement;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn(`[resend] RESEND_API_KEY no configurada, se omite envío a ${params.to}`);
    return;
  }

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from: FROM,
    to: params.to,
    subject: params.subject,
    react: params.react,
  });

  if (error) {
    console.error("[resend] Error enviando correo:", error);
  }
}
