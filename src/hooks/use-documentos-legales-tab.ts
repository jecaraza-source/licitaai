"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { descargarBlob } from "@/lib/descargar-archivo";
import type { TipoDocumentoLegal } from "@/lib/documentos-legales";

// Toda la lógica de datos de la pestaña Documentos Legales vive aquí,
// separada de `documentos-legales-tab.tsx` (presentación) — así una
// herramienta de rediseño de UI (p. ej. v0) puede tocar el JSX del
// componente sin arriesgar la lógica de negocio de este hook.

export interface DocumentoLegalEstado {
  tipo: TipoDocumentoLegal;
  titulo: string;
  listo: boolean;
  faltantes: string[];
}

export function useDocumentosLegalesTab(licitacionId: string) {
  const [documentos, setDocumentos] = useState<DocumentoLegalEstado[] | null>(null);
  const [descargando, setDescargando] = useState<string | null>(null);
  const [convocanteNombre, setConvocanteNombre] = useState("");
  const [convocanteCargo, setConvocanteCargo] = useState("");
  const [guardandoConvocante, setGuardandoConvocante] = useState(false);
  const [regenerando, setRegenerando] = useState(false);

  const cargar = useCallback(() => {
    return fetch(`/api/licitaciones/${licitacionId}/documentos-legales`)
      .then((res) => res.json())
      .then((json) => {
        setDocumentos(json.data?.documentos ?? []);
        setConvocanteNombre(json.data?.convocanteRepresentanteNombre ?? "");
        setConvocanteCargo(json.data?.convocanteRepresentanteCargo ?? "");
      });
  }, [licitacionId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function handleGuardarConvocante() {
    setGuardandoConvocante(true);
    const res = await fetch(`/api/licitaciones/${licitacionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        convocante_representante_nombre: convocanteNombre || null,
        convocante_representante_cargo: convocanteCargo || null,
      }),
    });
    setGuardandoConvocante(false);
    if (!res.ok) {
      toast.error("No se pudo guardar");
      return;
    }
    toast.success("Datos de la convocante guardados");
    cargar();
  }

  async function handleDescargar(tipo: TipoDocumentoLegal) {
    setDescargando(tipo);
    await descargarBlob(
      `/api/licitaciones/${licitacionId}/documentos-legales/${tipo}/exportar`,
      `${tipo}.docx`,
    );
    setDescargando(null);
  }

  async function handleDescargarAnexoA() {
    setDescargando("LEG09");
    await descargarBlob(
      `/api/licitaciones/${licitacionId}/propuesta-tecnica/exportar?anexoA=1`,
      "LEG09-anexo-a.docx",
      { method: "POST" },
    );
    setDescargando(null);
  }

  // Cada documento ya se genera al vuelo con los datos actuales al
  // descargarlo (nunca queda uno "cacheado" desactualizado); este botón
  // simplemente evita tener que descargarlos uno por uno: primero refresca
  // qué documentos ya tienen datos completos (por si se acaba de guardar
  // algo en Configuración o de subir un documento fuente) y luego
  // descarga en un solo .zip todos los que ya estén listos.
  async function handleGenerarTodos() {
    setRegenerando(true);
    await cargar();
    await descargarBlob(
      `/api/licitaciones/${licitacionId}/documentos-legales/exportar-todos`,
      "documentos-legales.zip",
    );
    setRegenerando(false);
  }

  return {
    documentos,
    descargando,
    convocanteNombre,
    setConvocanteNombre,
    convocanteCargo,
    setConvocanteCargo,
    guardandoConvocante,
    regenerando,
    handleGuardarConvocante,
    handleDescargar,
    handleDescargarAnexoA,
    handleGenerarTodos,
  };
}
