"use client";

import { useEffect, useState } from "react";
import { descargarBlob } from "@/lib/descargar-archivo";
import type { TipoDocumentoTecnico } from "@/lib/documentos-tecnicos";

export interface DocumentoTecnicoEstado {
  tipo: TipoDocumentoTecnico;
  titulo: string;
  listo: boolean;
  faltantes: string[];
}

export function useDocumentosTecnicosTab(licitacionId: string) {
  const [documentos, setDocumentos] = useState<DocumentoTecnicoEstado[] | null>(null);
  const [descargando, setDescargando] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/licitaciones/${licitacionId}/documentos-tecnicos`)
      .then((res) => res.json())
      .then((json) => setDocumentos(json.data?.documentos ?? []));
  }, [licitacionId]);

  async function handleDescargar(tipo: TipoDocumentoTecnico) {
    setDescargando(tipo);
    await descargarBlob(
      `/api/licitaciones/${licitacionId}/documentos-tecnicos/${tipo}/exportar`,
      `${tipo}.docx`,
    );
    setDescargando(null);
  }

  return { documentos, descargando, handleDescargar };
}
