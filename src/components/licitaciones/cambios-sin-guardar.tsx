"use client";

import { createContext, useContext, useEffect, useMemo, useRef } from "react";

// Las pestañas de la ficha se desmontan al cambiar de pestaña, así que lo que
// el usuario editó y no guardó se perdería sin aviso. Una pestaña con
// edición manual declara aquí si tiene cambios; la navegación de la ficha
// consulta el almacén antes de dejarla (ver licitacion-tabs-nav.tsx).
export interface AlmacenCambios {
  marcar(clave: string, hayCambios: boolean): void;
  hayCambios(): boolean;
  /** El usuario decidió descartar: nada queda pendiente aunque la pestaña siga montada un instante. */
  descartar(): void;
}

export function useAlmacenCambios(): AlmacenCambios {
  const claves = useRef(new Set<string>());
  return useMemo(
    () => ({
      marcar(clave, hayCambios) {
        if (hayCambios) claves.current.add(clave);
        else claves.current.delete(clave);
      },
      hayCambios: () => claves.current.size > 0,
      descartar() {
        claves.current.clear();
      },
    }),
    [],
  );
}

export const CambiosSinGuardarContext = createContext<AlmacenCambios | null>(null);

/** Declara que `clave` tiene (o ya no tiene) cambios sin guardar; al desmontarse se limpia sola. */
export function useCambiosSinGuardar(clave: string, hayCambios: boolean) {
  const almacen = useContext(CambiosSinGuardarContext);
  useEffect(() => {
    if (!almacen) return;
    almacen.marcar(clave, hayCambios);
    return () => almacen.marcar(clave, false);
  }, [almacen, clave, hayCambios]);
}
