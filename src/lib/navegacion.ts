import { ESTADOS_ID, ESTADOS_LICITACION, TIPOS_LICITACION } from "@/lib/validations/licitacion";

// Lógica pura de navegación: qué pestaña de la ficha está activa según la URL,
// a qué enlace apunta cada pestaña, qué elemento de la barra lateral se marca
// y cómo se guardan los filtros de la lista en la URL. Sin React, para poder
// probarla sin navegador.

export interface PestanaDef {
  value: string;
  label: string;
}

export interface GrupoPestanas {
  label: string;
  tabs: PestanaDef[];
}

// 13 pestañas agrupadas en 5 categorías por fase del proceso: un primer nivel
// de categorías y, si la categoría activa tiene más de una pestaña, un segundo
// nivel con las de esa categoría.
export const GRUPOS_PESTANAS: GrupoPestanas[] = [
  { label: "Resumen", tabs: [{ value: "resumen", label: "Resumen" }] },
  {
    label: "Documentos",
    tabs: [
      { value: "documentos", label: "Documentos" },
      { value: "documentos-legales", label: "Documentos Legales" },
      { value: "documentos-tecnicos", label: "Documentos Técnicos" },
    ],
  },
  {
    label: "Análisis",
    tabs: [
      { value: "analisis", label: "Análisis IA" },
      { value: "viabilidad", label: "Viabilidad" },
    ],
  },
  {
    label: "Propuesta",
    tabs: [
      { value: "partidas", label: "Partidas" },
      { value: "propuesta-tecnica", label: "Propuesta Técnica" },
      { value: "propuesta-economica", label: "Propuesta Económica" },
    ],
  },
  {
    label: "Proceso",
    tabs: [
      { value: "auditoria", label: "Auditoría" },
      { value: "liberacion", label: "Liberación" },
      { value: "junta", label: "Junta de Aclaraciones" },
      { value: "seguimiento", label: "Seguimiento" },
    ],
  },
];

export const PESTANA_INICIAL = "resumen";

const PESTANAS_VALIDAS = new Set(GRUPOS_PESTANAS.flatMap((g) => g.tabs.map((t) => t.value)));

export type PestanaLicitacion = string;

/** Pestaña pedida en `?tab=`; cualquier valor desconocido cae en la inicial. */
export function parsePestana(valor: string | null | undefined): PestanaLicitacion {
  return valor && PESTANAS_VALIDAS.has(valor) ? valor : PESTANA_INICIAL;
}

/** Enlace a una pestaña concreta de una licitación (la inicial no lleva parámetro). */
export function hrefPestana(licitacionId: string, pestana: PestanaLicitacion): string {
  const base = `/licitaciones/${licitacionId}`;
  const p = parsePestana(pestana);
  return p === PESTANA_INICIAL ? base : `${base}?tab=${p}`;
}

/** Grupo al que pertenece una pestaña (el primero si no existe). */
export function grupoDePestana(pestana: PestanaLicitacion): GrupoPestanas {
  return GRUPOS_PESTANAS.find((g) => g.tabs.some((t) => t.value === pestana)) ?? GRUPOS_PESTANAS[0];
}

const esRuta = (pathname: string, ruta: string) => pathname === ruta || pathname.startsWith(`${ruta}/`);

/**
 * ¿Debe marcarse `href` como activo en la barra lateral para `pathname`?
 * "Licitaciones" cubre la lista y la ficha de cada licitación, pero no
 * "Nueva licitación", que tiene su propio elemento.
 */
export function esRutaActiva(href: string, pathname: string): boolean {
  if (href === "/licitaciones") {
    return esRuta(pathname, "/licitaciones") && !esRuta(pathname, "/licitaciones/nueva");
  }
  return esRuta(pathname, href);
}

// --- Filtros de la lista de licitaciones en la URL ---

export const TODOS = "__all__";

export interface FiltrosLista {
  search: string;
  estadoLicitacion: string;
  tipo: string;
  estadoId: string;
  page: number;
}

export const FILTROS_VACIOS: FiltrosLista = {
  search: "",
  estadoLicitacion: TODOS,
  tipo: TODOS,
  estadoId: TODOS,
  page: 1,
};

type ParamsLike = { get(nombre: string): string | null };

const enLista = (valor: string | null, lista: readonly string[]) =>
  valor && lista.includes(valor) ? valor : TODOS;

/** Lee los filtros de la URL descartando valores que no existen. */
export function parseFiltrosLista(params: ParamsLike): FiltrosLista {
  const pagina = Number(params.get("pagina"));
  return {
    search: (params.get("q") ?? "").slice(0, 200),
    estadoLicitacion: enLista(params.get("estado"), ESTADOS_LICITACION),
    tipo: enLista(params.get("tipo"), TIPOS_LICITACION),
    estadoId: enLista(params.get("jurisdiccion"), ESTADOS_ID),
    page: Number.isInteger(pagina) && pagina >= 1 ? pagina : 1,
  };
}

/** Query string con solo los filtros activos ("" si no hay ninguno). */
export function serializarFiltrosLista(f: FiltrosLista): string {
  const params = new URLSearchParams();
  if (f.search) params.set("q", f.search);
  if (f.estadoLicitacion !== TODOS) params.set("estado", f.estadoLicitacion);
  if (f.tipo !== TODOS) params.set("tipo", f.tipo);
  if (f.estadoId !== TODOS) params.set("jurisdiccion", f.estadoId);
  if (f.page > 1) params.set("pagina", String(f.page));
  return params.toString();
}

const CLAVES_FILTROS = ["q", "estado", "tipo", "jurisdiccion", "pagina"];

/**
 * Query string resultante de aplicar los filtros a la URL actual: reemplaza
 * solo las claves de la lista y respeta cualquier otro parámetro (p. ej. `tab`).
 */
export function aplicarFiltrosAQuery(searchActual: string, f: FiltrosLista): string {
  const params = new URLSearchParams(searchActual);
  for (const clave of CLAVES_FILTROS) params.delete(clave);
  new URLSearchParams(serializarFiltrosLista(f)).forEach((valor, clave) => params.set(clave, valor));
  return params.toString();
}

// --- Cambios sin guardar al salir de la pestaña o de la ficha ---

export type DestinoSalida =
  | { tipo: "pestana"; pestana: PestanaLicitacion }
  | { tipo: "ruta"; href: string };

/**
 * ¿Qué haría el clic en un enlace estando en `ubicacion`? Sirve para decidir si
 * hay que avisar de cambios sin guardar: `null` si el enlace deja todo donde
 * está (otro sitio, ancla, o la misma pestaña), `pestana` si solo cambia la
 * pestaña de esta ficha y `ruta` si lleva a otra página de la app.
 */
export function destinoDeEnlace(
  href: string,
  ubicacion: { href: string; pestana: PestanaLicitacion },
): DestinoSalida | null {
  let destino: URL;
  let actual: URL;
  try {
    actual = new URL(ubicacion.href);
    destino = new URL(href, actual);
  } catch {
    return null;
  }
  if (destino.origin !== actual.origin) return null;
  if (destino.pathname === actual.pathname) {
    // Mismo documento: solo cuenta si cambia la pestaña (un ancla o el mismo
    // `?tab=` no pierden nada).
    const pestana = parsePestana(destino.searchParams.get("tab"));
    return pestana === ubicacion.pestana ? null : { tipo: "pestana", pestana };
  }
  return { tipo: "ruta", href: `${destino.pathname}${destino.search}${destino.hash}` };
}
