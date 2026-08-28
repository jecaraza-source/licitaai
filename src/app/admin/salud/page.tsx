"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface Metricas {
  generado_at: string;
  jobs: {
    por_estado: Record<string, number>;
    ultimas_24h: { total: number; completados: number; fallidos: number; cancelados: number; expirados: number };
    sin_intervencion_pct: number | null;
    arranque_seg: { p50: number | null; p95: number | null; max: number | null };
    dead_letter: { ultima_hora: number; ultimas_24h: number };
    atascados: number;
    ultimo_arranque_at: string | null;
  };
  circuit_breakers: Array<{ provider: string; estado: string; fallos_consecutivos: number; abierto_hasta: string | null }>;
  consumo_ia: {
    orgs_con_gasto: number;
    gasto_total_mes_usd: number;
    orgs_sobre_80pct: number;
    top_orgs: Array<{ organization_id: string; nombre: string; gasto_usd: number; cuota_usd: number | null; pct_cuota: number | null }>;
  };
  flags_activos: string[];
}

// SLO iniciales (docs/p2/10-slo-y-alertas.md).
function sloArranque(p95: number | null) {
  if (p95 == null) return { txt: "sin datos", ok: true };
  return { txt: `${p95}s`, ok: p95 < 10 };
}
function sloSinIntervencion(pct: number | null) {
  if (pct == null) return { txt: "sin datos", ok: true };
  return { txt: `${pct}%`, ok: pct >= 98 };
}

function estadoBadge(estado: string) {
  const v =
    estado === "OPEN" ? "destructive" : estado === "HALF_OPEN" ? "secondary" : "outline";
  return <Badge variant={v as "destructive" | "secondary" | "outline"}>{estado}</Badge>;
}

export default function SaludPage() {
  const [m, setM] = useState<Metricas | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/salud");
      if (res.status === 403) {
        setError("No autorizado. Este panel es solo para el equipo de plataforma.");
        return;
      }
      if (!res.ok) {
        setError("No se pudieron cargar las métricas.");
        return;
      }
      const body = await res.json();
      setM(body.data as Metricas);
      setError(null);
    } catch {
      setError("No se pudieron cargar las métricas.");
    } finally {
      setCargando(false);
    }
  }, []);

  const refrescar = useCallback(async () => {
    setCargando(true);
    await cargar();
  }, [cargar]);

  useEffect(() => {
    // Carga inicial + refresco cada 30s. cargar() actualiza estado en su
    // callback async (no sincrónicamente); mismo patrón que analisis-ia-tab.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargar();
    const t = setInterval(cargar, 30_000);
    return () => clearInterval(t);
  }, [cargar]);

  if (error) {
    return <div className="p-8 text-sm text-destructive">{error}</div>;
  }
  if (!m) {
    return <div className="p-8 text-sm text-muted-foreground">Cargando…</div>;
  }

  const arranque = sloArranque(m.jobs.arranque_seg.p95);
  const sinInterv = sloSinIntervencion(m.jobs.sin_intervencion_pct);
  const breakerAbierto = m.circuit_breakers.some((c) => c.estado === "OPEN");

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Activity className="size-5 text-primary" /> Salud de la plataforma
        </h1>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>Actualizado {new Date(m.generado_at).toLocaleTimeString()}</span>
          <Button variant="ghost" size="sm" onClick={refrescar} disabled={cargando}>
            <RefreshCw className={cargando ? "animate-spin" : ""} />
          </Button>
        </div>
      </div>

      {/* SLO */}
      <div className="grid gap-4 sm:grid-cols-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Arranque de job p95</CardTitle></CardHeader>
          <CardContent className={arranque.ok ? "text-2xl font-semibold" : "text-2xl font-semibold text-destructive"}>
            {arranque.txt}
            <p className="text-xs font-normal text-muted-foreground">SLO &lt; 10 s</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Jobs sin intervención</CardTitle></CardHeader>
          <CardContent className={sinInterv.ok ? "text-2xl font-semibold" : "text-2xl font-semibold text-destructive"}>
            {sinInterv.txt}
            <p className="text-xs font-normal text-muted-foreground">SLO &ge; 98 %</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Dead letter (1 h)</CardTitle></CardHeader>
          <CardContent className={m.jobs.dead_letter.ultima_hora >= 20 ? "text-2xl font-semibold text-destructive" : "text-2xl font-semibold"}>
            {m.jobs.dead_letter.ultima_hora}
            <p className="text-xs font-normal text-muted-foreground">{m.jobs.dead_letter.ultimas_24h} en 24 h</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Jobs atascados</CardTitle></CardHeader>
          <CardContent className={m.jobs.atascados > 0 ? "text-2xl font-semibold text-destructive" : "text-2xl font-semibold"}>
            {m.jobs.atascados}
            <p className="text-xs font-normal text-muted-foreground">AUTHORIZED &gt; 5 min</p>
          </CardContent>
        </Card>
      </div>

      {/* Jobs */}
      <Card>
        <CardHeader><CardTitle>Jobs</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex flex-wrap gap-2">
            {Object.entries(m.jobs.por_estado).length === 0 && <span className="text-muted-foreground">Sin jobs activos</span>}
            {Object.entries(m.jobs.por_estado).map(([e, n]) => (
              <Badge key={e} variant="outline">{e}: {n}</Badge>
            ))}
          </div>
          <p className="text-muted-foreground">
            Últimas 24 h: {m.jobs.ultimas_24h.total} totales · {m.jobs.ultimas_24h.completados} completados ·{" "}
            {m.jobs.ultimas_24h.fallidos} fallidos · {m.jobs.ultimas_24h.expirados} expirados ·
            arranque p50 {m.jobs.arranque_seg.p50 ?? "–"}s / máx {m.jobs.arranque_seg.max ?? "–"}s
          </p>
        </CardContent>
      </Card>

      {/* Circuit breakers */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Circuit breakers {breakerAbierto && <Badge variant="destructive">degradado</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>Proveedor</TableHead><TableHead>Estado</TableHead><TableHead>Fallos</TableHead><TableHead>Abierto hasta</TableHead></TableRow></TableHeader>
            <TableBody>
              {m.circuit_breakers.map((c) => (
                <TableRow key={c.provider}>
                  <TableCell className="font-medium">{c.provider}</TableCell>
                  <TableCell>{estadoBadge(c.estado)}</TableCell>
                  <TableCell>{c.fallos_consecutivos}</TableCell>
                  <TableCell className="text-muted-foreground">{c.abierto_hasta ? new Date(c.abierto_hasta).toLocaleTimeString() : "–"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Consumo IA */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Consumo de IA (mes en curso)
            {m.consumo_ia.orgs_sobre_80pct > 0 && (
              <Badge variant="secondary">{m.consumo_ia.orgs_sobre_80pct} org(s) &gt; 80 % de cuota</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            ${m.consumo_ia.gasto_total_mes_usd} en {m.consumo_ia.orgs_con_gasto} organizaciones
          </p>
          <Table>
            <TableHeader><TableRow><TableHead>Organización</TableHead><TableHead className="text-right">Gasto</TableHead><TableHead className="text-right">Cuota</TableHead><TableHead className="text-right">%</TableHead></TableRow></TableHeader>
            <TableBody>
              {m.consumo_ia.top_orgs.map((o) => (
                <TableRow key={o.organization_id}>
                  <TableCell>{o.nombre}</TableCell>
                  <TableCell className="text-right">${o.gasto_usd}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{o.cuota_usd != null ? `$${o.cuota_usd}` : "–"}</TableCell>
                  <TableCell className={`text-right ${o.pct_cuota != null && o.pct_cuota >= 80 ? "text-destructive" : ""}`}>
                    {o.pct_cuota != null ? `${o.pct_cuota}%` : "–"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {m.flags_activos.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Feature flags activos</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {m.flags_activos.map((f) => <Badge key={f} variant="outline">{f}</Badge>)}
          </CardContent>
        </Card>
      )}

      <p className="text-xs text-muted-foreground">
        Core Web Vitals, latencia de API y errores 5xx: Vercel Analytics / Speed Insights y Sentry.
        Alertas por severidad: <code>/api/cron/monitoreo</code> (cada 10 min) → Sentry.
      </p>
    </div>
  );
}
