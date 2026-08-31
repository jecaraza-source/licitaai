"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from "@tanstack/react-table";
import { ChevronLeft, ChevronRight, FileSearch, Search, X } from "lucide-react";
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { EstadoBadge } from "@/components/licitaciones/estado-badge";
import { ESTADOS_ID, ESTADOS_LICITACION, TIPOS_LICITACION } from "@/lib/validations/licitacion";
import { cn } from "@/lib/utils";
import type { Licitacion } from "@/types";

interface LicitacionConScore extends Licitacion {
  checklist_score: number;
}

function scoreDotColor(score: number) {
  if (score >= 80) return "bg-emerald-500";
  if (score >= 50) return "bg-amber-500";
  return "bg-destructive";
}

function ScoreDot({ score, label }: { score: number; label: string }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={<span className={cn("size-2.5 shrink-0 rounded-full", scoreDotColor(score))} />}
      />
      <TooltipContent>
        {label}: {score}%
      </TooltipContent>
    </Tooltip>
  );
}

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
  const [rows, setRows] = useState<LicitacionConScore[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [estadoLicitacion, setEstadoLicitacion] = useState<string>(ALL);
  const [tipo, setTipo] = useState<string>(ALL);
  const [estadoId, setEstadoId] = useState<string>(ALL);
  const [empresaScore, setEmpresaScore] = useState<number>(0);

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
        setRows(json.data?.data ?? []);
        setCount(json.data?.count ?? 0);
        setEmpresaScore(json.data?.empresaScore ?? 0);
        setLoading(false);
      })
      .catch((err) => {
        if (err instanceof Error && err.name === "AbortError") return;
        setLoading(false);
      });

    return () => controller.abort();
  }, [page, search, estadoLicitacion, tipo, estadoId]);

  const columns = useMemo<ColumnDef<LicitacionConScore>[]>(
    () => [
      {
        header: "Expediente",
        accessorKey: "numero_expediente",
        cell: ({ row }) => (
          <div className="min-w-0">
            <Link
              href={`/licitaciones/${row.original.id}`}
              className="font-semibold text-primary hover:underline"
            >
              {row.original.numero_expediente}
            </Link>
            <p className="mt-0.5 max-w-[240px] truncate text-xs text-muted-foreground">
              {row.original.titulo}
            </p>
          </div>
        ),
      },
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
        cell: ({ row }) => (
          <span className="font-medium tabular-nums">{formatMonto(row.original.monto_maximo)}</span>
        ),
      },
      {
        header: "Fecha entrega",
        accessorKey: "fecha_entrega_propuesta",
        cell: ({ row }) => formatFecha(row.original.fecha_entrega_propuesta),
      },
      {
        header: "Documentación",
        id: "documentacion",
        cell: ({ row }) => (
          <div className="flex items-center gap-1.5">
            <ScoreDot score={row.original.checklist_score} label="Requisitos de la licitación" />
            <ScoreDot score={empresaScore} label="Documentos corporativos de la empresa" />
          </div>
        ),
      },
    ],
    [empresaScore],
  );

  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  const pageCount = Math.max(1, Math.ceil(count / PAGE_SIZE));

  const hasFilters =
    search !== "" || estadoLicitacion !== ALL || tipo !== ALL || estadoId !== ALL;

  function limpiarFiltros() {
    setPage(1);
    setSearch("");
    setEstadoLicitacion(ALL);
    setTipo(ALL);
    setEstadoId(ALL);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-xl border bg-card p-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            placeholder="Buscar por expediente, título o institución…"
            value={search}
            onChange={(e) => {
              setPage(1);
              setSearch(e.target.value);
            }}
            className="h-11 pl-10"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={estadoLicitacion}
            onValueChange={(v) => {
              setPage(1);
              setEstadoLicitacion(v ?? ALL);
            }}
          >
            <SelectTrigger className="h-10 w-full sm:w-40">
              <SelectValue placeholder="Estado">
                {() => (estadoLicitacion === ALL ? "Todos los estados" : estadoLicitacion)}
              </SelectValue>
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
            <SelectTrigger className="h-10 w-full sm:w-40">
              <SelectValue placeholder="Tipo">
                {() => (tipo === ALL ? "Todos los tipos" : TIPO_LABELS[tipo])}
              </SelectValue>
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
            <SelectTrigger className="h-10 w-full sm:w-36">
              <SelectValue placeholder="Jurisdicción">
                {() => (estadoId === ALL ? "Todas" : estadoId)}
              </SelectValue>
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
          {hasFilters && (
            <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" onClick={limpiarFiltros}>
              <X className="size-4" />
              Limpiar filtros
            </Button>
          )}
        </div>
      </div>

      {/* Vista de tabla (md+) */}
      <div className="hidden overflow-x-auto rounded-xl border bg-card md:block">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="hover:bg-transparent">
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={`skeleton-${i}`} className="hover:bg-transparent">
                  {columns.map((_col, j) => (
                    <TableCell key={j} className="py-4">
                      <div className="h-4 w-full max-w-[120px] animate-pulse rounded bg-muted" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : table.getRowModel().rows.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={columns.length} className="h-48">
                  <div className="flex flex-col items-center justify-center gap-3 text-center">
                    <span className="flex size-12 items-center justify-center rounded-full bg-secondary text-primary">
                      <FileSearch className="size-6" />
                    </span>
                    <div>
                      <p className="font-medium">No se encontraron licitaciones</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Ajusta los filtros o crea una nueva licitación.
                      </p>
                    </div>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id} className="transition-colors hover:bg-secondary/40">
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className="py-4">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Vista de tarjetas (mobile) */}
      <div className="flex flex-col gap-3 md:hidden">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={`card-skeleton-${i}`} className="rounded-xl border bg-card p-4">
              <div className="h-4 w-24 animate-pulse rounded bg-muted" />
              <div className="mt-3 h-4 w-full animate-pulse rounded bg-muted" />
              <div className="mt-2 h-4 w-2/3 animate-pulse rounded bg-muted" />
            </div>
          ))
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-xl border bg-card p-8 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-secondary text-primary">
              <FileSearch className="size-6" />
            </span>
            <div>
              <p className="font-medium">No se encontraron licitaciones</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Ajusta los filtros o crea una nueva licitación.
              </p>
            </div>
          </div>
        ) : (
          rows.map((row) => (
            <Link
              key={row.id}
              href={`/licitaciones/${row.id}`}
              className="rounded-xl border bg-card p-4 transition-colors hover:bg-secondary/40"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-primary">{row.numero_expediente}</p>
                  <h3 className="mt-1 line-clamp-2 text-sm font-medium">{row.titulo}</h3>
                </div>
                <EstadoBadge estado={row.estado_licitacion} />
              </div>
              <p className="mt-2 truncate text-xs text-muted-foreground">{row.institucion}</p>
              <div className="mt-3 flex items-center justify-between border-t pt-3">
                <div className="text-sm">
                  <span className="font-medium tabular-nums">{formatMonto(row.monto_maximo)}</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {formatFecha(row.fecha_entrega_propuesta)}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <ScoreDot score={row.checklist_score} label="Requisitos de la licitación" />
                  <ScoreDot score={empresaScore} label="Documentos corporativos de la empresa" />
                </div>
              </div>
            </Link>
          ))
        )}
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
