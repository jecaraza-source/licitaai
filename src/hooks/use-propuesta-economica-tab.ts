"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { descargarWorkbook } from "@/lib/exportar-excel";

export interface FilaPartida {
  id: string;
  partida_id: string | null;
  descripcion: string;
  cantidad: number | null;
  unidad: string | null;
  precio_unitario_ofertado: number | null;
  subtotal: number | null;
  iva: number | null;
  total: number | null;
  margen_porcentaje: number | null;
  precio_referencia_mercado: number | null;
  cantidad_compras_mx: number | null;
  precio_unitario_compras_mx: number | null;
  total_compras_mx: number | null;
}

export interface ConfigPropuestaEconomica {
  tipo_precio: string | null;
  incluye_iva: boolean;
  moneda: string;
  condiciones_pago: string | null;
  tiempo_entrega_dias: number | null;
  validez_oferta_dias: number | null;
}

const IVA_RATE = 0.16;

function calcularFila(fila: FilaPartida): FilaPartida {
  const cantidad = fila.cantidad ?? 0;
  const pu = fila.precio_unitario_ofertado;
  if (pu === null) {
    return { ...fila, subtotal: null, iva: null, total: null, margen_porcentaje: null };
  }
  const subtotal = cantidad * pu;
  const iva = subtotal * IVA_RATE;
  const total = subtotal + iva;
  const margen =
    fila.precio_referencia_mercado && fila.precio_referencia_mercado > 0
      ? ((pu - fila.precio_referencia_mercado) / fila.precio_referencia_mercado) * 100
      : null;
  return { ...fila, subtotal, iva, total, margen_porcentaje: margen };
}

export function usePropuestaEconomicaTab(licitacionId: string) {
  const [filas, setFilas] = useState<FilaPartida[] | null>(null);
  const [config, setConfig] = useState<ConfigPropuestaEconomica | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [analizando, setAnalizando] = useState(false);
  const [dictamen, setDictamen] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/licitaciones/${licitacionId}/propuesta-economica`)
      .then((res) => res.json())
      .then((json) => {
        setFilas((json.data?.partidas ?? []).map(calcularFila));
        setConfig(json.data?.config ?? null);
      });
  }, [licitacionId]);

  function actualizarPrecio(id: string, precio: string) {
    setFilas((prev) =>
      (prev ?? []).map((f) =>
        f.id === id
          ? calcularFila({ ...f, precio_unitario_ofertado: precio === "" ? null : Number(precio) })
          : f,
      ),
    );
  }

  function actualizarComprasMx(id: string, campo: "total_compras_mx", valor: string) {
    setFilas((prev) =>
      (prev ?? []).map((f) =>
        f.id === id ? { ...f, [campo]: valor === "" ? null : Number(valor) } : f,
      ),
    );
  }

  const resumen = useMemo(() => {
    if (!filas) return { subtotal: 0, iva: 0, total: 0 };
    return filas.reduce(
      (acc, f) => ({
        subtotal: acc.subtotal + (f.subtotal ?? 0),
        iva: acc.iva + (f.iva ?? 0),
        total: acc.total + (f.total ?? 0),
      }),
      { subtotal: 0, iva: 0, total: 0 },
    );
  }, [filas]);

  async function handleGuardar() {
    if (!filas) return;
    setGuardando(true);
    const res = await fetch(`/api/licitaciones/${licitacionId}/propuesta-economica`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config, partidas: filas }),
    });
    setGuardando(false);
    if (!res.ok) {
      toast.error("No se pudo guardar la propuesta económica");
      return;
    }
    toast.success("Propuesta económica guardada");
  }

  async function handleAnalizar() {
    await handleGuardar();
    setAnalizando(true);
    const res = await fetch(`/api/licitaciones/${licitacionId}/propuesta-economica/analizar`, {
      method: "POST",
    });
    const json = await res.json();
    setAnalizando(false);
    if (!res.ok) {
      toast.error("No se pudo analizar la competitividad", { description: json.error?.message ?? json.error });
      return;
    }
    setDictamen(json.data.dictamen);
  }

  async function exportarExcel() {
    if (!filas) return;
    const ExcelJS = (await import("exceljs")).default;
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Propuesta Económica");
    sheet.addRow([
      "#",
      "Descripción",
      "Cantidad",
      "Unidad",
      "P.U. Referencia",
      "P.U. Ofertado",
      "Subtotal",
      "IVA",
      "Total",
    ]);
    filas.forEach((f, i) => {
      const row = i + 2; // fila 1 = encabezados
      sheet.addRow([
        i + 1,
        f.descripcion,
        f.cantidad ?? 0,
        f.unidad ?? "",
        f.precio_referencia_mercado ?? 0,
        f.precio_unitario_ofertado ?? 0,
      ]);
      sheet.getCell(`G${row}`).value = { formula: `C${row}*F${row}` };
      sheet.getCell(`H${row}`).value = { formula: `G${row}*0.16` };
      sheet.getCell(`I${row}`).value = { formula: `G${row}+H${row}` };
    });

    await descargarWorkbook(workbook, "propuesta-economica.xlsx");
  }

  return {
    filas,
    guardando,
    analizando,
    dictamen,
    actualizarPrecio,
    actualizarComprasMx,
    resumen,
    handleGuardar,
    handleAnalizar,
    exportarExcel,
  };
}
