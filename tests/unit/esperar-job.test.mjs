// Unit tests de src/lib/esperar-job.ts: detección de respuestas 202 de jobs y
// espera hasta estado terminal (individual y por lote) sin red ni timers reales.
// Run: npx tsx tests/unit/esperar-job.test.mjs
import {
  respuestaAsincrona,
  respuestaLoteAsincrona,
  jobTerminal,
  esperarJob,
  esperarLote,
  resumirLote,
  descripcionFalloJob,
} from "../../src/lib/esperar-job.ts";

let pass = 0;
let fail = 0;
function check(name, ok, detail) {
  if (ok) {
    pass++;
    console.log(`PASS  ${name}`);
  } else {
    fail++;
    console.log(`FAIL  ${name}${detail ? " — " + detail : ""}`);
  }
}

// --- respuestaAsincrona -----------------------------------------------------
check(
  "reconoce el 202 de encolarOperacionIA",
  respuestaAsincrona({ data: { job_id: "j1", estado: "PENDING", async: true } })?.job_id === "j1",
);
check("una respuesta síncrona (análisis) no es async", respuestaAsincrona({ data: { id: "a1", resumen: "x" } }) === null);
check("async:false no cuenta", respuestaAsincrona({ data: { job_id: "j1", async: false } }) === null);
check("sin job_id no cuenta", respuestaAsincrona({ data: { async: true } }) === null);
check("job_id vacío no cuenta", respuestaAsincrona({ data: { job_id: "", async: true } }) === null);
check("null / undefined / string no rompen", respuestaAsincrona(null) === null && respuestaAsincrona(undefined) === null && respuestaAsincrona("x") === null);
check("data null no rompe", respuestaAsincrona({ data: null }) === null);
check("estado ausente cae a PENDING", respuestaAsincrona({ data: { job_id: "j", async: true } })?.estado === "PENDING");

// --- respuestaLoteAsincrona (auditar-todos) ------------------------------------
{
  const l = respuestaLoteAsincrona({ data: { jobs: ["a", "b"], expediente_job_id: "e", async: true } });
  check("reconoce el 202 de auditar-todos", l?.jobs.length === 2 && l.expediente_job_id === "e");
}
check("lote: la respuesta síncrona no cuenta", respuestaLoteAsincrona({ data: { documentos: { fallidos: 0 } } }) === null);
check("lote: sin async:true no cuenta", respuestaLoteAsincrona({ data: { jobs: ["a"] } }) === null);
check("lote: ignora ids inválidos y tolera expediente ausente", (() => {
  const l = respuestaLoteAsincrona({ data: { jobs: ["a", 3, "", null], async: true } });
  return l?.jobs.length === 1 && l.expediente_job_id === null;
})());
check("lote vacío (sin documentos) sigue siendo un lote async", respuestaLoteAsincrona({ data: { jobs: [], expediente_job_id: "e", async: true } })?.jobs.length === 0);
check("un 202 de job único no se confunde con un lote", respuestaLoteAsincrona({ data: { job_id: "j", async: true } }) === null);

// --- jobTerminal -------------------------------------------------------------
check(
  "estados terminales",
  ["COMPLETED", "FAILED", "CANCELLED", "EXPIRED"].every(jobTerminal) &&
    !["PENDING", "AUTHORIZED", "RUNNING", "RETRYING", "", null, undefined].some(jobTerminal),
);

// --- esperarJob --------------------------------------------------------------
const job = (estado, extra = {}) => ({ id: "j1", estado, progreso: 0, ...extra });
const sinDormir = async () => {};

function secuencia(...pasos) {
  let i = 0;
  const llamadas = { n: 0 };
  const fetchJob = async () => {
    llamadas.n++;
    const paso = pasos[Math.min(i++, pasos.length - 1)];
    if (paso instanceof Error) throw paso;
    return paso;
  };
  return { fetchJob, llamadas };
}

{
  const { fetchJob, llamadas } = secuencia(job("PENDING"), job("RUNNING"), job("COMPLETED"));
  const vistos = [];
  const r = await esperarJob("j1", { fetchJob, dormir: sinDormir, onJob: (j) => vistos.push(j.estado) });
  check("espera hasta COMPLETED", r.estado === "completado" && llamadas.n === 3);
  check("reporta cada lectura en vivo", vistos.join(",") === "PENDING,RUNNING,COMPLETED");
}
{
  const { fetchJob } = secuencia(job("RUNNING"), job("FAILED", { error_seguro: "boom" }));
  const r = await esperarJob("j1", { fetchJob, dormir: sinDormir });
  check("FAILED → fallido con el job (para mostrar error_seguro)", r.estado === "fallido" && r.job.error_seguro === "boom");
}
{
  const { fetchJob } = secuencia(job("EXPIRED"));
  check("EXPIRED → fallido", (await esperarJob("j1", { fetchJob, dormir: sinDormir })).estado === "fallido");
}
{
  const { fetchJob } = secuencia(job("CANCELLED"));
  check("CANCELLED → cancelado", (await esperarJob("j1", { fetchJob, dormir: sinDormir })).estado === "cancelado");
}
{
  const { fetchJob, llamadas } = secuencia(new Error("red"), new Error("red"), job("COMPLETED"));
  const r = await esperarJob("j1", { fetchJob, dormir: sinDormir });
  check("tolera errores transitorios de red", r.estado === "completado" && llamadas.n === 3);
}
{
  const { fetchJob, llamadas } = secuencia(new Error("red"));
  const r = await esperarJob("j1", { fetchJob, dormir: sinDormir, erroresMaximos: 3 });
  check("se rinde tras N errores seguidos (tiempo_agotado, no lanza)", r.estado === "tiempo_agotado" && llamadas.n === 3);
}
{
  // Un error aislado entre lecturas buenas no acumula.
  const { fetchJob } = secuencia(new Error("x"), job("RUNNING"), new Error("x"), job("RUNNING"), new Error("x"), job("COMPLETED"));
  const r = await esperarJob("j1", { fetchJob, dormir: sinDormir, erroresMaximos: 2 });
  check("los errores consecutivos se reinician tras una lectura buena", r.estado === "completado");
}
{
  let t = 0;
  const { fetchJob } = secuencia(job("RUNNING"));
  const r = await esperarJob("j1", {
    fetchJob,
    dormir: async (ms) => {
      t += ms;
    },
    ahora: () => t,
    esperaMaximaMs: 20_000,
  });
  check("respeta el tope de espera total", r.estado === "tiempo_agotado" && t >= 20_000, `t=${t}`);
}
{
  const esperas = [];
  let t = 0;
  const { fetchJob } = secuencia(job("RUNNING"));
  await esperarJob("j1", {
    fetchJob,
    dormir: async (ms) => {
      esperas.push(ms);
      t += ms;
    },
    ahora: () => t,
    esperaMaximaMs: 60_000,
    intervaloInicialMs: 3_000,
    intervaloMaxMs: 8_000,
  });
  check(
    "el intervalo crece con backoff y se topa en el máximo",
    esperas[0] === 3_000 && esperas[1] === 4_500 && esperas.every((e) => e <= 8_000) && esperas.at(-1) === 8_000,
    esperas.join(","),
  );
}
{
  const ctl = new AbortController();
  const { fetchJob, llamadas } = secuencia(job("RUNNING"));
  const r = await esperarJob("j1", {
    fetchJob,
    signal: ctl.signal,
    dormir: async () => ctl.abort(),
  });
  check("abortar (desmontar la pantalla) corta la espera", r.estado === "abortado" && llamadas.n === 1);
}
{
  const ctl = new AbortController();
  ctl.abort();
  const { fetchJob, llamadas } = secuencia(job("COMPLETED"));
  const r = await esperarJob("j1", { fetchJob, signal: ctl.signal, dormir: sinDormir });
  check("ya abortado: ni siquiera consulta", r.estado === "abortado" && llamadas.n === 0);
}

// --- resumirLote / esperarLote ----------------------------------------------
{
  const p = resumirLote(["a", "b", "c", "d"], [
    { id: "a", estado: "COMPLETED" },
    { id: "b", estado: "FAILED" },
    { id: "c", estado: "RUNNING" },
    { id: "z", estado: "COMPLETED" }, // ajeno al lote
  ]);
  check(
    "resumirLote cuenta solo los ids del lote; ausente = no terminado",
    p.total === 4 && p.terminados === 2 && p.completados === 1 && p.fallidos === 1,
    JSON.stringify(p),
  );
}
{
  const rondas = [
    [{ id: "a", estado: "RUNNING" }, { id: "b", estado: "PENDING" }],
    [{ id: "a", estado: "COMPLETED" }, { id: "b", estado: "RUNNING" }],
    [{ id: "a", estado: "COMPLETED" }, { id: "b", estado: "FAILED" }],
  ];
  let i = 0;
  const progresos = [];
  const r = await esperarLote(["a", "b"], {
    fetchEstados: async () => rondas[Math.min(i++, rondas.length - 1)],
    dormir: sinDormir,
    onProgreso: (p) => progresos.push(p.terminados),
  });
  check(
    "espera a que TODO el lote termine, con una consulta por ronda",
    r.estado === "terminado" && r.completados === 1 && r.fallidos === 1 && i === 3,
    JSON.stringify(r),
  );
  check("reporta el avance del lote", progresos.join(",") === "0,1,2", progresos.join(","));
}
{
  const r = await esperarLote([], { fetchEstados: async () => [], dormir: sinDormir });
  check("lote vacío termina de inmediato", r.estado === "terminado" && r.total === 0);
}
{
  let t = 0;
  const r = await esperarLote(["a"], {
    fetchEstados: async () => [{ id: "a", estado: "RUNNING" }],
    dormir: async (ms) => {
      t += ms;
    },
    ahora: () => t,
    esperaMaximaMs: 10_000,
    intervaloMs: 4_000,
  });
  check("lote: tope de espera → tiempo_agotado con el progreso", r.estado === "tiempo_agotado" && r.progreso.terminados === 0);
}
{
  const r = await esperarLote(["a"], {
    fetchEstados: async () => {
      throw new Error("red");
    },
    dormir: sinDormir,
    erroresMaximos: 2,
  });
  check("lote: errores seguidos → tiempo_agotado, no lanza", r.estado === "tiempo_agotado");
}
{
  const ctl = new AbortController();
  const r = await esperarLote(["a"], {
    fetchEstados: async () => [{ id: "a", estado: "RUNNING" }],
    signal: ctl.signal,
    dormir: async () => ctl.abort(),
  });
  check("lote: abortar corta la espera", r.estado === "abortado");
}

// --- descripcionFalloJob -----------------------------------------------------
check("completado y abortado no generan mensaje", descripcionFalloJob({ estado: "completado", job: job("COMPLETED") }) === null && descripcionFalloJob({ estado: "abortado" }) === null);
check("fallido usa error_seguro", descripcionFalloJob({ estado: "fallido", job: job("FAILED", { error_seguro: "El proveedor no respondió" }) }) === "El proveedor no respondió");
check("fallido sin error_seguro da un texto genérico (nunca vacío)", /falló/i.test(descripcionFalloJob({ estado: "fallido", job: job("FAILED") }) ?? ""));
check("cancelado y tiempo agotado tienen texto", /cancel/i.test(descripcionFalloJob({ estado: "cancelado", job: job("CANCELLED") }) ?? "") && /sigue en proceso/i.test(descripcionFalloJob({ estado: "tiempo_agotado" }) ?? ""));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
