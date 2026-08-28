// P2 punch-list B6 — diff estructural de dos valores JSON, para comparar
// una versión de un resultado de IA con la que reemplaza.
//
// Devuelve un árbol paralelo a la estructura de los datos donde cada nodo
// dice qué le pasó: sin_cambios / agregado / eliminado / modificado.
// El frontend lo renderiza; aquí solo se calcula.

export type EstadoDiff = "sin_cambios" | "agregado" | "eliminado" | "modificado";

export interface NodoDiff {
  estado: EstadoDiff;
  /** Valor anterior (undefined si fue agregado). */
  antes?: unknown;
  /** Valor nuevo (undefined si fue eliminado). */
  despues?: unknown;
  /** Hijos, para objetos y arrays. Solo presente cuando `estado` !== "sin_cambios"
   * y ambos lados son del mismo tipo compuesto. */
  hijos?: Record<string, NodoDiff>;
}

function esObjetoPlano(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function iguales(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((x, i) => iguales(x, b[i]));
  }
  if (esObjetoPlano(a) && esObjetoPlano(b)) {
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    return ka.length === kb.length && ka.every((k) => iguales(a[k], b[k]));
  }
  return false;
}

/**
 * `antes` = versión que se reemplaza, `despues` = versión nueva.
 */
export function diffJson(antes: unknown, despues: unknown): NodoDiff {
  if (iguales(antes, despues)) {
    return { estado: "sin_cambios", antes, despues };
  }

  // Ambos objetos planos → diff por clave.
  if (esObjetoPlano(antes) && esObjetoPlano(despues)) {
    const hijos: Record<string, NodoDiff> = {};
    for (const clave of new Set([...Object.keys(antes), ...Object.keys(despues)])) {
      const tieneAntes = clave in antes;
      const tieneDespues = clave in despues;
      if (tieneAntes && !tieneDespues) {
        hijos[clave] = { estado: "eliminado", antes: antes[clave] };
      } else if (!tieneAntes && tieneDespues) {
        hijos[clave] = { estado: "agregado", despues: despues[clave] };
      } else {
        hijos[clave] = diffJson(antes[clave], despues[clave]);
      }
    }
    return { estado: "modificado", hijos };
  }

  // Ambos arrays → diff posicional (suficiente para las salidas de IA, que
  // son listas ordenadas de secciones/hallazgos, no conjuntos).
  if (Array.isArray(antes) && Array.isArray(despues)) {
    const hijos: Record<string, NodoDiff> = {};
    const max = Math.max(antes.length, despues.length);
    for (let i = 0; i < max; i++) {
      if (i >= despues.length) {
        hijos[i] = { estado: "eliminado", antes: antes[i] };
      } else if (i >= antes.length) {
        hijos[i] = { estado: "agregado", despues: despues[i] };
      } else {
        hijos[i] = diffJson(antes[i], despues[i]);
      }
    }
    return { estado: "modificado", hijos };
  }

  // Tipos distintos o escalares distintos → cambio de valor.
  return { estado: "modificado", antes, despues };
}

/** Resumen plano: cuántas hojas se agregaron / eliminaron / cambiaron. */
export function resumenDiff(nodo: NodoDiff): { agregados: number; eliminados: number; modificados: number } {
  const acc = { agregados: 0, eliminados: 0, modificados: 0 };
  function visitar(n: NodoDiff) {
    if (n.hijos) {
      for (const h of Object.values(n.hijos)) visitar(h);
      return;
    }
    if (n.estado === "agregado") acc.agregados++;
    else if (n.estado === "eliminado") acc.eliminados++;
    else if (n.estado === "modificado") acc.modificados++;
  }
  visitar(nodo);
  return acc;
}
