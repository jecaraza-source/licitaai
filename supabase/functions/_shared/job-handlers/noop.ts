// P2 · A2 — handler de prueba para validar la infraestructura de jobs sin
// depender de un proveedor de IA. Solo se usa con jobs de tipo "noop"
// (tests de A2). Se comporta según input_json.modo:
//
//   "ok" (default)  -> completa de inmediato
//   "lento"         -> espera input_json.ms (tope 5s) y completa
//   "falla"         -> lanza siempre (error reintentable)
//   "falla_fatal"   -> lanza ErrorNoReintentable
//   "falla_una_vez" -> falla en el intento 1, completa en el 2
//   "multi_step"    -> input_json.steps pasos, uno por invocación del worker
//   "cancelable"    -> bucle que chequea cancelado() en cada checkpoint

import { ErrorNoReintentable, type JobContext, type StepResult } from "../job-runner.ts";

export async function noopHandler(ctx: JobContext): Promise<StepResult> {
  const input = ctx.job.input_json ?? {};
  const modo = typeof input.modo === "string" ? input.modo : "ok";

  if (modo === "falla") {
    throw new Error("noop: fallo simulado");
  }
  if (modo === "falla_fatal") {
    throw new ErrorNoReintentable("noop: fallo fatal simulado");
  }
  if (modo === "falla_una_vez" && ctx.job.intentos <= 1) {
    throw new Error("noop: fallo del primer intento");
  }

  if (modo === "lento") {
    const ms = Math.min(Number(input.ms) || 200, 5000);
    await new Promise((r) => setTimeout(r, ms));
  }

  if (modo === "cancelable") {
    for (let i = 0; i < 20; i++) {
      if (await ctx.cancelado()) {
        return { completo: { resultRef: { cancelado: true, en_paso: i } } };
      }
      await ctx.reportarProgreso(i * 5, `paso ${i}`);
      await new Promise((r) => setTimeout(r, 150));
    }
  }

  if (modo === "multi_step") {
    const total = Math.max(1, Math.min(Number(input.steps) || 3, 10));
    const actual = ctx.job.step_actual ? Number(ctx.job.step_actual) : 0;
    const previos = (ctx.job.result_ref as { pasos?: number[] } | null)?.pasos ?? [];
    const pasos = [...previos, actual];

    if (actual + 1 < total) {
      const progreso = Math.round(((actual + 1) / total) * 100);
      await ctx.reportarProgreso(progreso, `paso ${actual + 1}/${total}`);
      return {
        siguienteStep: { step: String(actual + 1), resultParcial: { pasos }, progreso },
      };
    }
    return { completo: { resultRef: { pasos, total } } };
  }

  await ctx.reportarProgreso(100);
  return {
    completo: {
      resultRef: { ok: true, at: new Date().toISOString() },
      provider: "noop",
      modelo: "noop",
    },
  };
}
