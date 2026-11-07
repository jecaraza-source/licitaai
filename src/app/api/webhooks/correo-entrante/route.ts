import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import {
  esRemitenteGubernamental,
  extraerAlias,
  resumirAdjuntos,
  sugerirLicitacion,
  textoPlano,
} from "@/lib/correos-compras-mx";

// Webhook del proveedor de correo entrante (Resend, evento `email.received`).
// Cada empresa tiene una dirección propia en el subdominio de entrada
// (CORREO_ENTRADA_DOMINIO); aquí se identifica a la empresa por la dirección a
// la que llegó el correo y se guarda en su bandeja. Corre sin sesión de
// usuario, así que usa service_role y se protege con la firma del webhook:
// sin ella (o con una inválida) no se toca nada.
//
// Idempotente: el proveedor reintenta los webhooks y un mismo correo puede
// llegar más de una vez; `resend_email_id` es único.
const ok = (cuerpo: Record<string, unknown> = {}) => NextResponse.json({ ok: true, ...cuerpo });

export async function POST(request: NextRequest) {
  const secreto = process.env.RESEND_WEBHOOK_SECRET;
  const apiKey = process.env.RESEND_API_KEY;
  const dominio = process.env.CORREO_ENTRADA_DOMINIO;
  if (!secreto || !apiKey || !dominio) {
    // Falla cerrado: sin configurar no se acepta nada.
    return NextResponse.json({ error: "Recepción de correos no configurada" }, { status: 503 });
  }

  const resend = new Resend(apiKey);
  const payload = await request.text();
  let evento;
  try {
    evento = resend.webhooks.verify({
      payload,
      headers: {
        id: request.headers.get("svix-id") ?? "",
        timestamp: request.headers.get("svix-timestamp") ?? "",
        signature: request.headers.get("svix-signature") ?? "",
      },
      webhookSecret: secreto,
    });
  } catch {
    return NextResponse.json({ error: "Firma inválida" }, { status: 401 });
  }
  if (evento.type !== "email.received") return ok({ ignorado: "tipo" });

  const datos = evento.data;
  const alias = extraerAlias(
    [...(datos.to ?? []), ...(datos.received_for ?? []), ...(datos.cc ?? []), ...(datos.bcc ?? [])],
    dominio,
  );
  // Un correo a una dirección que no es de ninguna empresa no es un error
  // nuestro: se responde 200 para que el proveedor no lo reintente.
  if (!alias) return ok({ ignorado: "sin_alias" });

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  const { data: org } = await supabase.from("organizations").select("id").eq("alias_correo", alias).maybeSingle();
  if (!org) return ok({ ignorado: "alias_desconocido" });

  const { data: yaGuardado } = await supabase
    .from("correos_compras_mx")
    .select("id")
    .eq("resend_email_id", datos.email_id)
    .maybeSingle();
  if (yaGuardado) return ok({ duplicado: true });

  // El aviso solo trae metadatos; el contenido se pide aparte. Si falla, 500
  // para que el proveedor reintente.
  const { data: correo, error: errorLectura } = await resend.emails.receiving.get(datos.email_id);
  if (errorLectura || !correo) {
    console.error("[correo-entrante] no se pudo leer el correo", datos.email_id);
    return NextResponse.json({ error: "No se pudo leer el correo" }, { status: 500 });
  }

  const cuerpo = textoPlano(correo.html, correo.text);
  const asunto = (correo.subject ?? datos.subject ?? "").slice(0, 500);

  const { data: licitaciones } = await supabase
    .from("licitaciones")
    .select("id, numero_expediente")
    .eq("organization_id", org.id)
    .limit(5000);

  const { error } = await supabase.from("correos_compras_mx").insert({
    organization_id: org.id,
    resend_email_id: datos.email_id,
    message_id: correo.message_id ?? datos.message_id ?? null,
    de: (correo.from ?? datos.from).slice(0, 500),
    para: correo.to ?? datos.to ?? [],
    asunto,
    cuerpo_texto: cuerpo,
    adjuntos: resumirAdjuntos(correo.attachments),
    remitente_reconocido: esRemitenteGubernamental(correo.from ?? datos.from),
    recibido_en: correo.created_at ?? datos.created_at ?? new Date().toISOString(),
    sugerencia_licitacion_id: sugerirLicitacion(asunto, cuerpo, licitaciones ?? []),
  });

  if (error) {
    // 23505: otro reintento lo guardó entre la comprobación y el insert.
    if (error.code === "23505") return ok({ duplicado: true });
    console.error("[correo-entrante] no se pudo guardar el correo", error.code);
    return NextResponse.json({ error: "No se pudo guardar el correo" }, { status: 500 });
  }

  return ok();
}
