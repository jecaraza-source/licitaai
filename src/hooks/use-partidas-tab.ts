"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { descargarWorkbook } from "@/lib/exportar-excel";
import { createClient } from "@/lib/supabase/client";
import type { EstudioMercado, Partida } from "@/types";

export type PartidaConEstudio = Partida & { estudio_mercado: EstudioMercado | null };

export function usePartidasTab(licitacionId: string) {
  const [partidas, setPartidas] = useState<PartidaConEstudio[] | null>(null);
  const [generandoTodas, setGenerandoTodas] = useState(false);
  const [generandoId, setGenerandoId] = useState<string | null>(null);
  const [detalle, setDetalle] = useState<PartidaConEstudio | null>(null);
  const [solicitudNombre, setSolicitudNombre] = useState<string | null>(null);

  function cargar() {
    fetch(`/api/licitaciones/${licitacionId}/partidas`)
      .then((res) => res.json())
      .then((json) => setPartidas(json.data ?? []))
      .catch(() => setPartidas([]));
  }

  useEffect(() => {
    cargar();
    createClient()
      .from("documentos")
      .select("nombre")
      .eq("licitacion_id", licitacionId)
      .eq("tipo_documento", "SOLICITUD_ESTUDIO_MERCADO")
      .maybeSingle()
      .then(({ data }) => setSolicitudNombre(data?.nombre ?? null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [licitacionId]);

  async function generarEstudio(partidaId?: string) {
    if (partidaId) setGenerandoId(partidaId);
    else setGenerandoTodas(true);

    const res = await fetch(`/api/licitaciones/${licitacionId}/estudio-mercado`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(partidaId ? { partida_id: partidaId } : {}),
    });
    const json = await res.json();

    setGenerandoId(null);
    setGenerandoTodas(false);

    if (!res.ok) {
      toast.error("No se pudo generar el estudio de mercado", { description: json.error?.message ?? json.error });
      return;
    }

    toast.success("Estudio de mercado generado");
    cargar();
  }

  async function exportarExcel() {
    if (!partidas) return;
    const ExcelJS = (await import("exceljs")).default;
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Partidas");
    sheet.columns = [
      { header: "Número", key: "numero" },
      { header: "Descripción", key: "descripcion" },
      { header: "Unidad", key: "unidad" },
      { header: "Cantidad", key: "cantidad" },
      { header: "P.U. Referencia", key: "puReferencia" },
      { header: "Confianza", key: "confianza" },
    ];
    for (const p of partidas) {
      sheet.addRow({
        numero: p.numero,
        descripcion: p.descripcion,
        unidad: p.unidad ?? "",
        cantidad: p.cantidad ?? "",
        puReferencia: p.estudio_mercado?.precio_recomendado ?? p.precio_unitario_referencia ?? "",
        confianza: p.estudio_mercado?.nivel_confianza ?? "",
      });
    }
    await descargarWorkbook(workbook, "partidas.xlsx");
  }

  return {
    partidas,
    generandoTodas,
    generandoId,
    detalle,
    setDetalle,
    solicitudNombre,
    generarEstudio,
    exportarExcel,
  };
}
