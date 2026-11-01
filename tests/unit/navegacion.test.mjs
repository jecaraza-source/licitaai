// Unit tests de la lógica pura de navegación (src/lib/navegacion.ts):
// pestañas en la URL, enlaces a pestañas, elemento activo de la barra lateral
// y filtros de la lista de licitaciones en la URL.
// Run: npx tsx tests/unit/navegacion.test.mjs
import {
  FILTROS_VACIOS,
  GRUPOS_PESTANAS,
  PESTANA_INICIAL,
  TODOS,
  aplicarFiltrosAQuery,
  destinoDeEnlace,
  esRutaActiva,
  grupoDePestana,
  hrefPestana,
  parseFiltrosLista,
  parsePestana,
  serializarFiltrosLista,
} from "../../src/lib/navegacion.ts";

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
const params = (qs) => new URLSearchParams(qs);

// --- pestañas ---
const todas = GRUPOS_PESTANAS.flatMap((g) => g.tabs.map((t) => t.value));
check("hay 13 pestañas sin valores repetidos", todas.length === 13 && new Set(todas).size === 13, String(todas.length));
check("parsePestana acepta cada pestaña real", todas.every((v) => parsePestana(v) === v));
check("parsePestana: sin parámetro → pestaña inicial", parsePestana(null) === PESTANA_INICIAL && parsePestana(undefined) === PESTANA_INICIAL);
check("parsePestana: valor desconocido o malicioso → pestaña inicial", ["", "nada", "../x", "<script>", "LIBERACION"].every((v) => parsePestana(v) === PESTANA_INICIAL));
check("hrefPestana lleva ?tab= salvo en la inicial", hrefPestana("abc", "liberacion") === "/licitaciones/abc?tab=liberacion" && hrefPestana("abc", "resumen") === "/licitaciones/abc");
check("hrefPestana normaliza una pestaña inválida", hrefPestana("abc", "inventada") === "/licitaciones/abc");
check("grupoDePestana: Liberación pertenece a Proceso", grupoDePestana("liberacion").label === "Proceso");
check("grupoDePestana: desconocida cae en el primer grupo", grupoDePestana("x").label === GRUPOS_PESTANAS[0].label);
check("todo grupo tiene al menos una pestaña", GRUPOS_PESTANAS.every((g) => g.tabs.length >= 1));

// --- barra lateral ---
check("Licitaciones activa en la lista", esRutaActiva("/licitaciones", "/licitaciones"));
check("Licitaciones activa dentro de una ficha (antes no se marcaba ninguna)", esRutaActiva("/licitaciones", "/licitaciones/f1f10000-0000-4000-8000-0000000000b1"));
check("Licitaciones NO activa en Nueva licitación", !esRutaActiva("/licitaciones", "/licitaciones/nueva"));
check("Nueva licitación activa solo en su ruta", esRutaActiva("/licitaciones/nueva", "/licitaciones/nueva") && !esRutaActiva("/licitaciones/nueva", "/licitaciones"));
check("Dashboard, Referencias y Configuración se marcan en su ruta", esRutaActiva("/dashboard", "/dashboard") && esRutaActiva("/referencias", "/referencias") && esRutaActiva("/configuracion", "/configuracion"));
check("no hay coincidencias por prefijo de texto (/licitacionesX)", !esRutaActiva("/licitaciones", "/licitacionesX") && !esRutaActiva("/dashboard", "/dashboards"));
check("solo un elemento activo por ruta de ficha", ["/dashboard", "/licitaciones", "/licitaciones/nueva", "/referencias", "/configuracion"].filter((h) => esRutaActiva(h, "/licitaciones/abc")).length === 1);

// --- filtros de la lista ---
check("URL vacía → filtros vacíos", JSON.stringify(parseFiltrosLista(params(""))) === JSON.stringify(FILTROS_VACIOS));
const f = parseFiltrosLista(params("q=digital&estado=ENVIADA&tipo=SERVICIOS&jurisdiccion=FEDERAL&pagina=3"));
check("lee búsqueda, estado, tipo, jurisdicción y página", f.search === "digital" && f.estadoLicitacion === "ENVIADA" && f.tipo === "SERVICIOS" && f.estadoId === "FEDERAL" && f.page === 3, JSON.stringify(f));
const malo = parseFiltrosLista(params("estado=HACKEADA&tipo=%27%3B--&jurisdiccion=MARTE&pagina=-4"));
check("valores inexistentes se descartan", malo.estadoLicitacion === TODOS && malo.tipo === TODOS && malo.estadoId === TODOS && malo.page === 1, JSON.stringify(malo));
check("página no numérica o decimal → 1", parseFiltrosLista(params("pagina=abc")).page === 1 && parseFiltrosLista(params("pagina=2.5")).page === 1 && parseFiltrosLista(params("pagina=0")).page === 1);
check("la búsqueda se recorta a 200 caracteres", parseFiltrosLista(params("q=" + "a".repeat(500))).search.length === 200);
check("sin filtros activos no hay query string", serializarFiltrosLista(FILTROS_VACIOS) === "");
check("solo se serializan los filtros activos", serializarFiltrosLista({ ...FILTROS_VACIOS, estadoLicitacion: "ENVIADA", page: 2 }) === "estado=ENVIADA&pagina=2");
const ida = { search: "expediente 1/2", estadoLicitacion: "ANALISIS", tipo: "OBRA_PUBLICA", estadoId: "CDMX", page: 4 };
check("serializar y leer es una ida y vuelta exacta (con espacios y /)", JSON.stringify(parseFiltrosLista(params(serializarFiltrosLista(ida)))) === JSON.stringify(ida));

check("aplicarFiltrosAQuery respeta parámetros ajenos como tab", aplicarFiltrosAQuery("?tab=liberacion", { ...FILTROS_VACIOS, estadoLicitacion: "ENVIADA" }) === "tab=liberacion&estado=ENVIADA");
check("aplicarFiltrosAQuery reemplaza los filtros previos y quita los vacíos", aplicarFiltrosAQuery("?q=viejo&estado=NUEVA&pagina=3&tab=x", { ...FILTROS_VACIOS, search: "nuevo" }) === "tab=x&q=nuevo");
check("aplicarFiltrosAQuery sin filtros ni otros parámetros → vacío", aplicarFiltrosAQuery("?q=a&pagina=2", FILTROS_VACIOS) === "");

// --- destinoDeEnlace: cuándo un clic puede perder cambios sin guardar ---
const aqui = { href: "https://app.test/licitaciones/abc?tab=propuesta-economica", pestana: "propuesta-economica" };
check("enlace a otra pestaña de la misma ficha → pestana", JSON.stringify(destinoDeEnlace("/licitaciones/abc?tab=liberacion", aqui)) === JSON.stringify({ tipo: "pestana", pestana: "liberacion" }));
check("enlace a la pestaña inicial (sin ?tab) → resumen", JSON.stringify(destinoDeEnlace("/licitaciones/abc", aqui)) === JSON.stringify({ tipo: "pestana", pestana: "resumen" }));
check("enlace a la misma pestaña no pierde nada", destinoDeEnlace("/licitaciones/abc?tab=propuesta-economica", aqui) === null);
check("pestaña desconocida cae en resumen (como la página)", JSON.stringify(destinoDeEnlace("/licitaciones/abc?tab=nada", aqui)) === JSON.stringify({ tipo: "pestana", pestana: "resumen" }));
check("un ancla de la misma página no avisa", destinoDeEnlace("#seccion", aqui) === null);
check("enlace a otra página de la app → ruta con query y ancla", JSON.stringify(destinoDeEnlace("/configuracion?x=1#a", aqui)) === JSON.stringify({ tipo: "ruta", href: "/configuracion?x=1#a" }));
check("enlace absoluto al mismo origen se trata como ruta", JSON.stringify(destinoDeEnlace("https://app.test/dashboard", aqui)) === JSON.stringify({ tipo: "ruta", href: "/dashboard" }));
check("enlace a otro sitio no se intercepta", destinoDeEnlace("https://otro.test/licitaciones/abc", aqui) === null);
check("href inválido no rompe", destinoDeEnlace("http://", aqui) === null);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
