// P2 · A6 — notificación por email de jobs largos (ADR 0003).
//
// El worker llama a notificarJobSiCorresponde() tras cada transición
// terminal. Solo notifica si el job tardó > UMBRAL_MS y aún no se notificó
// (marcar_job_notificado hace el guard atómico). Best-effort: nunca lanza y
// se acota con un timeout corto para no consumir el presupuesto del step.
// Sin RESEND_API_KEY configurada, el job igual se marca como notificado y
// no se envía nada (comportamiento como src/lib/resend.ts).

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

const UMBRAL_MS = 60_000;
const TIMEOUT_ENVIO_MS = 8_000;

const ETIQUETA: Record<string, string> = {
  COMPLETED: "se completó",
  FAILED: "no pudo completarse",
  EXPIRED: "expiró sin completarse",
};

const NOMBRE_OPERACION: Record<string, string> = {
  "procesar-documento": "Procesamiento de documento",
  "analizar-bases": "Análisis de bases",
  "generar-estudio-mercado": "Estudio de mercado",
  "generar-preguntas-junta": "Generación de preguntas para la junta",
  "generar-propuesta-tecnica": "Generación de propuesta técnica",
  "auditar-documento": "Auditoría de documento",
  "auditar-expediente": "Auditoría de expediente",
  "seguimiento-analizar-fallo": "Análisis del acta de fallo",
  "analizar-documento-corporativo": "Análisis de documento corporativo",
  "procesar-referencia-legal": "Procesamiento de referencia legal",
  noop: "Operación de prueba",
};

interface JobParaNotificar {
  id: string;
  tipo: string;
  estado: string;
  requested_by: string | null;
  created_at: string;
  finished_at: string | null;
  error_seguro: string | null;
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );
}

export async function notificarJobSiCorresponde(
  service: SupabaseClient,
  job: JobParaNotificar,
): Promise<void> {
  try {
    if (!["COMPLETED", "FAILED", "EXPIRED"].includes(job.estado)) return;
    if (!job.requested_by || !job.finished_at) return;

    const duracion = new Date(job.finished_at).getTime() - new Date(job.created_at).getTime();
    if (!Number.isFinite(duracion) || duracion < UMBRAL_MS) return;

    // Guard atómico: solo un llamador gana este UPDATE.
    const { data: gano } = await service.rpc("marcar_job_notificado", { p_job_id: job.id });
    if (gano !== true) return;

    const { data: usuario } = await service
      .from("users")
      .select("email, nombre")
      .eq("id", job.requested_by)
      .maybeSingle();
    if (!usuario?.email) return;

    const apiKey = Deno.env.get("RESEND_API_KEY");
    const from = Deno.env.get("RESEND_FROM_EMAIL") || "LicitaAI <onboarding@resend.dev>";
    const appUrl = Deno.env.get("NEXT_PUBLIC_APP_URL") || "";
    if (!apiKey) {
      console.warn(`[job-notify] RESEND_API_KEY no configurada; job ${job.id} marcado sin enviar`);
      return;
    }

    const operacion = NOMBRE_OPERACION[job.tipo] ?? job.tipo;
    const verbo = ETIQUETA[job.estado] ?? "terminó";
    const asunto = `${operacion} — ${job.estado === "COMPLETED" ? "listo" : "no completado"}`;
    const detalleError =
      job.estado !== "COMPLETED" && job.error_seguro
        ? `<p style="color:#8c2131">${esc(job.error_seguro)}</p>`
        : "";
    const cta = appUrl
      ? `<p><a href="${esc(appUrl)}" style="color:#8c2131">Abrir LicitaAI</a></p>`
      : "";

    const html = `<div style="font-family:Calibri,Arial,sans-serif">
      <h2 style="color:#8c2131">${esc(operacion)} ${esc(verbo)}</h2>
      <p>Hola ${esc(usuario.nombre ?? "")},</p>
      <p>La operación <strong>${esc(operacion)}</strong> que solicitaste ${esc(verbo)}.</p>
      ${detalleError}
      ${cta}
      <p style="color:#888;font-size:12px">Este es un aviso automático de LicitaAI.</p>
    </div>`;

    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_ENVIO_MS);
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to: usuario.email, subject: asunto, html }),
        signal: ctrl.signal,
      });
      if (!res.ok) {
        console.error(`[job-notify] Resend respondió ${res.status} para job ${job.id}`);
      }
    } finally {
      clearTimeout(t);
    }
  } catch (e) {
    console.error(`[job-notify] fallo notificando job ${job.id}:`, e);
  }
}
