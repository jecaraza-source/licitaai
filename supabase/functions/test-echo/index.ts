// P2 — Edge Function de prueba SOLO para los tests del wrapper invocar-ef.
// Ejerce authenticate({ permitirJob: true }) y devuelve la forma que espera
// handlerInvocaEF: { ok, data, _usage, _citas, _nivel_confianza }.
// No llama a ningún modelo. Inofensiva en producción (no muta nada).

import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { authenticate } from "../_shared/auth.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const ctx = await authenticate(req, {
    ruta: "test-echo",
    requiereEscritura: true,
    permitirJob: true,
  });
  if (ctx instanceof Response) return ctx;

  const body = await req.json().catch(() => ({}));

  return new Response(
    JSON.stringify({
      ok: true,
      data: { echo: body, organizationId: ctx.organizationId, userId: ctx.userId },
      _usage: {
        tokens_input: Number(body.tok_in) || 1000,
        tokens_output: Number(body.tok_out) || 200,
        modelo: "claude-sonnet-5",
        provider: "anthropic",
      },
      _citas: Array.isArray(body._citas) ? body._citas : [],
      _nivel_confianza: body.nivel_confianza ?? "MEDIO",
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
