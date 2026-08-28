// P2 · J — carga HTTP contra la API de jobs (k6). NO crea infraestructura.
//
// Complementa carga-local.mjs (que va directo a Postgres): esto ejercita el
// stack completo Next.js → apiRoute (auth + RLS + rate limit + flags) →
// crear_job, midiendo latencia y errores como los ve un cliente real.
//
// Requiere:
//   - la app corriendo (local: `npm run dev`; o una URL de staging autorizada)
//   - Supabase local arrancado
//   - el flag `jobs.api` ON (env FLAG_JOBS_API=on al arrancar la app)
//   - N tokens de acceso pre-generados (script de setup abajo) en TOKENS_JSON
//
// Generar tokens (una vez):
//   node tests/load/gen-tokens.mjs 20 > /tmp/tokens.json
//
// Correr:
//   k6 run -e BASE_URL=http://localhost:3000 -e TOKENS_JSON=/tmp/tokens.json \
//     tests/load/api-jobs.k6.js
//
// k6 no viene con este repo; instalar: https://k6.io/docs/get-started/installation/

import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";
import { SharedArray } from "k6/data";

const BASE_URL = (__ENV.BASE_URL || "http://localhost:3000").replace(/\/$/, "");

const tokens = new SharedArray("tokens", () => {
  const path = __ENV.TOKENS_JSON;
  if (!path) throw new Error("Falta -e TOKENS_JSON=<ruta al json de gen-tokens.mjs>");
  return JSON.parse(open(path)); // [{ organizationId, accessToken }, ...]
});

const errores = new Rate("errores_negocio");
const latenciaCrear = new Trend("latencia_crear_job", true);

export const options = {
  scenarios: {
    // rampa: 0 → 30 VUs en 30s, mantiene 30 por 1m, baja en 20s
    carga: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "30s", target: 30 },
        { duration: "1m", target: 30 },
        { duration: "20s", target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_duration: ["p(95)<800", "p(99)<2000"],
    errores_negocio: ["rate<0.01"],
    checks: ["rate>0.99"],
  },
};

export default function () {
  const cred = tokens[__VU % tokens.length];
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${cred.accessToken}`,
  };

  // 1. crear un job noop
  const idem = `k6:${cred.organizationId}:${__VU}:${__ITER}`;
  const crear = http.post(
    `${BASE_URL}/api/jobs`,
    JSON.stringify({ tipo: "noop", input: { ms: 0 }, idempotency_key: idem }),
    { headers, tags: { name: "POST /api/jobs" } },
  );
  latenciaCrear.add(crear.timings.duration);
  const creado = check(crear, {
    "crear job: 200/201": (r) => r.status === 200 || r.status === 201,
    "crear job: devuelve id": (r) => !!r.json("data.id"),
  });
  errores.add(!creado);
  if (!creado) { sleep(1); return; }

  const jobId = crear.json("data.id");

  // 2. consultar su estado un par de veces (patrón de polling del frontend)
  for (let i = 0; i < 2; i++) {
    sleep(0.5);
    const get = http.get(`${BASE_URL}/api/jobs/${jobId}`, { headers, tags: { name: "GET /api/jobs/:id" } });
    check(get, { "get job: 200": (r) => r.status === 200 });
  }

  // 3. listar (dashboard)
  const lista = http.get(`${BASE_URL}/api/jobs?pageSize=20`, { headers, tags: { name: "GET /api/jobs" } });
  check(lista, { "listar: 200": (r) => r.status === 200 });

  sleep(1);
}
