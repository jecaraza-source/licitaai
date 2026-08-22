import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EstadoBadge } from "@/components/licitaciones/estado-badge";
import { EstadoSelector } from "@/components/licitaciones/estado-selector";
import { ActividadTimeline, type ActividadLogConUsuario } from "@/components/licitaciones/actividad-timeline";
import { DocumentosTab } from "@/components/licitaciones/documentos-tab";
import { AnalisisIaTab } from "@/components/licitaciones/analisis-ia-tab";
import { ChatDocumento } from "@/components/licitaciones/chat-documento";
import type { Licitacion } from "@/types";

const TABS = [
  { value: "resumen", label: "Resumen" },
  { value: "documentos", label: "Documentos" },
  { value: "analisis", label: "Análisis IA" },
  { value: "partidas", label: "Partidas" },
  { value: "propuesta-tecnica", label: "Propuesta Técnica" },
  { value: "propuesta-economica", label: "Propuesta Económica" },
  { value: "auditoria", label: "Auditoría" },
  { value: "junta", label: "Junta de Aclaraciones" },
];

const FECHA_FIELDS: { key: keyof Licitacion; label: string }[] = [
  { key: "fecha_publicacion", label: "Publicación" },
  { key: "fecha_junta_aclaraciones", label: "Junta de aclaraciones" },
  { key: "fecha_visita", label: "Visita" },
  { key: "fecha_entrega_propuesta", label: "Entrega de propuesta" },
  { key: "fecha_apertura_tecnica", label: "Apertura técnica" },
  { key: "fecha_apertura_economica", label: "Apertura económica" },
  { key: "fecha_fallo", label: "Fallo" },
];

function formatFecha(fecha: string | null) {
  if (!fecha) return "—";
  return new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(fecha),
  );
}

function formatMonto(monto: number | null) {
  if (monto === null) return "—";
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(monto);
}

async function getData(id: string) {
  const supabase = await createClient();

  const [{ data: licitacion }, { data: documentos }, { data: actividad }] = await Promise.all([
    supabase.from("licitaciones").select("*").eq("id", id).single(),
    supabase
      .from("documentos")
      .select("*")
      .eq("licitacion_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("actividad_log")
      .select("*, usuario:users(nombre)")
      .eq("licitacion_id", id)
      .order("created_at", { ascending: false })
      .limit(30),
  ]);

  if (!licitacion) return null;

  const actividadConUsuario: ActividadLogConUsuario[] = (actividad ?? []).map((log) => {
    const { usuario, ...rest } = log as typeof log & {
      usuario: { nombre: string } | null;
    };
    return { ...rest, usuario_nombre: usuario?.nombre ?? null };
  });

  return { licitacion, documentos: documentos ?? [], actividad: actividadConUsuario };
}

export default async function LicitacionDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const result = await getData(id);

  if (!result) {
    notFound();
  }

  const { licitacion, documentos, actividad } = result;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{licitacion.titulo}</h1>
            <EstadoBadge estado={licitacion.estado_licitacion} />
          </div>
          <p className="text-muted-foreground">
            {licitacion.numero_expediente} · {licitacion.institucion}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge variant="outline">{licitacion.estado_id}</Badge>
            <Badge variant="outline">{licitacion.sistema}</Badge>
            <Badge variant="outline">{licitacion.tipo}</Badge>
          </div>
        </div>
        <EstadoSelector licitacionId={licitacion.id} estadoActual={licitacion.estado_licitacion} />
      </div>

      <Tabs defaultValue="resumen">
        <TabsList className="flex-wrap">
          {TABS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="resumen" className="flex flex-col gap-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Fechas del procedimiento</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {FECHA_FIELDS.map((field) => (
                    <div key={field.key}>
                      <dt className="text-xs text-muted-foreground">{field.label}</dt>
                      <dd className="font-medium">{formatFecha(licitacion[field.key])}</dd>
                    </div>
                  ))}
                </dl>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Monto máximo</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{formatMonto(licitacion.monto_maximo)}</p>
              </CardContent>
            </Card>
          </div>
          <ActividadTimeline actividad={actividad} />
        </TabsContent>

        <TabsContent value="documentos">
          <DocumentosTab
            licitacionId={licitacion.id}
            organizationId={licitacion.organization_id}
            initialDocumentos={documentos}
          />
        </TabsContent>

        <TabsContent value="analisis" className="flex flex-col gap-6">
          <AnalisisIaTab licitacionId={licitacion.id} />
          <ChatDocumento licitacionId={licitacion.id} />
        </TabsContent>

        {TABS.filter((t) => !["resumen", "documentos", "analisis"].includes(t.value)).map((tab) => (
          <TabsContent key={tab.value} value={tab.value}>
            <Card>
              <CardHeader>
                <CardTitle>Próximamente</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  {tab.label} se construye en un sprint posterior.
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
