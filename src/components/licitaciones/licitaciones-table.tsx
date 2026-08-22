"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from "@tanstack/react-table";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EstadoBadge } from "@/components/licitaciones/estado-badge";
import { ESTADOS_ID, ESTADOS_LICITACION, TIPOS_LICITACION } from "@/lib/validations/licitacion";
import type { Licitacion } from "@/types";

const TIPO_LABELS: Record<string, string> = {
  ADQUISICION: "Adquisición",
  SERVICIOS: "Servicios",
  OBRA_PUBLICA: "Obra pública",
};

const PAGE_SIZE = 10;

function formatMonto(monto: number | null) {
  if (monto === null) return "—";
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(monto);
}

function formatFecha(fecha: string | null) {
  if (!fecha) return "—";
  return new Intl.DateTimeFormat("es-MX", { dateStyle: "medium" }).format(new Date(fecha));
}

const ALL = "__all__";

export function LicitacionesTable() {
  const [rows, setRows] = useState<Licitacion[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [estadoLicitacion, setEstadoLicitacion] = useState<string>(ALL);
  const [tipo, setTipo] = useState<string>(ALL);
  const [estadoId, setEstadoId] = useState<string>(ALL);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (search) params.set("search", search);
    if (estadoLicitacion !== ALL) params.set("estado_licitacion", estadoLicitacion);
    if (tipo !== ALL) params.set("tipo", tipo);
    if (estadoId !== ALL) params.set("estado_id", estadoId);

    fetch(`/api/licitaciones?${params.toString()}`, { signal: controller.signal })
      .then((res) => res.json())
      .then((json) => {
        setRows(json.data ?? []);
        setCount(json.count ?? 0);
        setLoading(false);
      })
      .catch((err) => {
        if (err instanceof Error && err.name === "AbortError") return;
        setLoading(false);
      });

    return () => controller.abort();
  }, [page, search, estadoLicitacion, tipo, estadoId]);

  const columns = useMemo<ColumnDef<Licitacion>[]>(
    () => [
      {
        header: "Expediente",
        accessorKey: "numero_expediente",
        cell: ({ row }) => (
          <Link
            href={`/licitaciones/${row.original.id}`}
            className="font-medium hover:underline"
          >
            {row.original.numero_expediente}
          </Link>
        ),
      },
      { header: "Título", accessorKey: "titulo" },
      { header: "Institución", accessorKey: "institucion" },
      {
        header: "Estado",
        accessorKey: "estado_licitacion",
        cell: ({ row }) => <EstadoBadge estado={row.original.estado_licitacion} />,
      },
      {
        header: "Tipo",
        accessorKey: "tipo",
        cell: ({ row }) => TIPO_LABELS[row.original.tipo] ?? row.original.tipo,
      },
      {
        header: "Monto",
        accessorKey: "monto_maximo",
        cell: ({ row }) => formatMonto(row.original.monto_maximo),
      },
      {
        header: "Fecha entrega",
        accessorKey: "fecha_entrega_propuesta",
        cell: ({ row }) => formatFecha(row.original.fecha_entrega_propuesta),
      },
    ],
    [],
  );

  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  const pageCount = Math.max(1, Math.ceil(count / PAGE_SIZE));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Buscar por expediente, título o institución…"
          value={search}
          onChange={(e) => {
            setPage(1);
            setSearch(e.target.value);
          }}
          className="max-w-xs"
        />
        <Select
          value={estadoLicitacion}
          onValueChange={(v) => {
            setPage(1);
            setEstadoLicitacion(v ?? ALL);
          }}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos los estados</SelectItem>
            {ESTADOS_LICITACION.map((e) => (
              <SelectItem key={e} value={e}>
                {e}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={tipo}
          onValueChange={(v) => {
            setPage(1);
            setTipo(v ?? ALL);
          }}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos los tipos</SelectItem>
            {TIPOS_LICITACION.map((t) => (
              <SelectItem key={t} value={t}>
                {TIPO_LABELS[t]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={estadoId}
          onValueChange={(v) => {
            setPage(1);
            setEstadoId(v ?? ALL);
          }}
        >
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Jurisdicción" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todas</SelectItem>
            {ESTADOS_ID.map((e) => (
              <SelectItem key={e} value={e}>
                {e}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                  Cargando…
                </TableCell>
              </TableRow>
            ) : table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                  No se encontraron licitaciones.
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {count} licitacion{count === 1 ? "" : "es"}
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon-sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            <ChevronLeft />
          </Button>
          <span className="text-sm text-muted-foreground">
            Página {page} de {pageCount}
          </span>
          <Button
            variant="outline"
            size="icon-sm"
            disabled={page >= pageCount}
            onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
          >
            <ChevronRight />
          </Button>
        </div>
      </div>
    </div>
  );
}
