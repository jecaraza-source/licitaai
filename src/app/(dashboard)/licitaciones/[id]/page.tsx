import dynamic from "next/dynamic";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarClock, Gavel, Wallet } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EstadoBadge } from "@/components/licitaciones/estado-badge";
import { EstadoSelector } from "@/components/licitaciones/estado-selector";
import { ProcesoTimeline } from "@/components/licitaciones/proceso-timeline";
import { ResumenAnexoTecnicoCard } from "@/components/licitaciones/resumen-anexo-tecnico-card";
import { ActividadTimeline, type ActividadLogConUsuario } from "@/components/licitaciones/actividad-timeline";
import { AnalisisIaTab } from "@/components/licitaciones/analisis-ia-tab";
import { ChatDocumento } from "@/components/licitaciones/chat-documento";
import { JuntaAclaracionesTab } from "@/components/licitaciones/junta-aclaraciones-tab";
import { ViabilidadTab } from "@/components/licitaciones/viabilidad-tab";
import { ResponsabilidadesCard } from "@/components/licitaciones/responsabilidades-card";
import { AuditoriaTab } from "@/components/licitaciones/auditoria-tab";
import { LiberacionTab } from "@/components/licitaciones/liberacion-tab";
import { SeguimientoTab } from "@/components/licitaciones/seguimiento-tab";

// P2 · F3 — code-split de las pestañas con dependencias pesadas (react-pdf,
// TipTap, exceljs, generadores docx). Radix TabsContent solo monta la
// pestaña activa, así que el chunk se descarga al cambiar de pestaña.
const cargando = () => (
  <div className="p-8 text-center text-sm text-muted-foreground">Cargando…</div>
);
const DocumentosTab = dynamic(() => import("@/components/licitaciones/documentos-tab").then((m) => m.DocumentosTab), { loading: cargando });
const PartidasTab = dynamic(() => import("@/components/licitaciones/partidas-tab").then((m) => m.PartidasTab), { loading: cargando });
const PropuestaTecnicaTab = dynamic(() => import("@/components/licitaciones/propuesta-tecnica-tab").then((m) => m.PropuestaTecnicaTab), { loading: cargando });
const PropuestaEconomicaTab = dynamic(() => import("@/components/licitaciones/propuesta-economica-tab").then((m) => m.PropuestaEconomicaTab), { loading: cargando });
const DocumentosLegalesTab = dynamic(() => import("@/components/licitaciones/documentos-legales-tab").then((m) => m.DocumentosLegalesTab), { loading: cargando });
const DocumentosTecnicosTab = dynamic(() => import("@/components/licitaciones/documentos-tecnicos-tab").then((m) => m.DocumentosTecnicosTab), { loading: cargando });
const MODALIDAD_LABELS: Record<string, string> = {
  ABIERTA: "Abierta",
  RESTRINGIDA: "Restringida",
  INVITACION_TRES: "Invitación a 3",
};

const TABS = [
  { value: "resumen", label: "Resumen" },
  { value: "documentos", label: "Documentos" },
  { value: "analisis", label: "Análisis IA" },
  { value: "viabilidad", label: "Viabilidad" },
  { value: "partidas", label: "Partidas" },
  { value: "propuesta-tecnica", label: "Propuesta Técnica" },
  { value: "propuesta-economica", label: "Propuesta Económica" },
  { value: "documentos-legales", label: "Documentos Legales" },
  { value: "documentos-tecnicos", label: "Documentos Técnicos" },
  { value: "auditoria", label: "Auditoría" },
  { value: "liberacion", label: "Liberación" },
  { value: "junta", label: "Junta de Aclaraciones" },
  { value: "seguimiento", label: "Seguimiento" },
];

function formatMonto(monto: number | null) {
  if (monto === null) return "—";
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(monto);
}

function formatFecha(fecha: string | null) {
  if (!fecha) return "Por definir";
  return new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(fecha));
}

async function getData(id: string) {
  const supabase = await createClient();

  const [{ data: licitacion }, { data: documentos }, { data: actividad }, { data: analisis }] =
    await Promise.all([
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
      supabase
        .from("analisis_bases")
        .select("objeto_contrato, tipo_procedimiento, especificaciones_tecnicas_json")
        .eq("licitacion_id", id)
        .maybeSingle(),
    ]);

  if (!licitacion) return null;

  const actividadConUsuario: ActividadLogConUsuario[] = (actividad ?? []).map((log) => {
    const { usuario, ...rest } = log as typeof log & {
      usuario: { nombre: string } | null;
    };
    return { ...rest, usuario_nombre: usuario?.nombre ?? null };
  });

  return { licitacion, documentos: documentos ?? [], actividad: actividadConUsuario, analisis };
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

  const { licitacion, documentos, actividad, analisis } = result;

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/licitaciones"
        className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Volver a licitaciones
      </Link>

      <div className="rounded-xl border bg-card p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm font-semibold text-primary">{licitacion.numero_expediente}</p>
              <EstadoBadge estado={licitacion.estado_licitacion} />
            </div>
            <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-balance">
              {licitacion.titulo}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">{licitacion.institucion}</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <Badge variant="outline">{licitacion.estado_id}</Badge>
              <Badge variant="outline">{licitacion.sistema}</Badge>
              <Badge variant="outline">{licitacion.tipo}</Badge>
              {licitacion.modalidad_procedimiento && (
                <Badge variant="outline">
                  {MODALIDAD_LABELS[licitacion.modalidad_procedimiento] ??
                    licitacion.modalidad_procedimiento}
                </Badge>
              )}
              {licitacion.es_investigacion_mercado && (
                <Badge variant="outline">Investigación de mercado</Badge>
              )}
            </div>
          </div>
          <EstadoSelector licitacionId={licitacion.id} estadoActual={licitacion.estado_licitacion} />
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 border-t pt-5 sm:grid-cols-3">
          <div className="flex items-start gap-2.5">
            <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary">
              <Wallet className="size-4" />
            </span>
            <div>
              <p className="text-xs text-muted-foreground">Monto máximo</p>
              <p className="font-semibold tabular-nums">{formatMonto(licitacion.monto_maximo)}</p>
            </div>
          </div>
          <div className="flex items-start gap-2.5">
            <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary">
              <CalendarClock className="size-4" />
            </span>
            <div>
              <p className="text-xs text-muted-foreground">Entrega de propuesta</p>
              <p className="font-medium">{formatFecha(licitacion.fecha_entrega_propuesta)}</p>
            </div>
          </div>
          <div className="flex items-start gap-2.5">
            <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary">
              <Gavel className="size-4" />
            </span>
            <div>
              <p className="text-xs text-muted-foreground">Fallo</p>
              <p className="font-medium">{formatFecha(licitacion.fecha_fallo)}</p>
            </div>
          </div>
        </div>
      </div>

      <Tabs defaultValue="resumen">
        <div className="-mx-1 overflow-x-auto px-1 pb-1">
          <TabsList className="w-max flex-nowrap">
            {TABS.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value} className="whitespace-nowrap">
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="resumen" className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Proceso de la licitación</CardTitle>
            </CardHeader>
            <CardContent>
              <ProcesoTimeline licitacion={licitacion} />
            </CardContent>
          </Card>
          <ResumenAnexoTecnicoCard
            tipo={licitacion.tipo}
            esInvestigacionMercado={licitacion.es_investigacion_mercado}
            analisis={analisis}
          />
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <ActividadTimeline actividad={actividad} />
            <ResponsabilidadesCard licitacionId={licitacion.id} />
          </div>
        </TabsContent>

        <TabsContent value="documentos">
          <DocumentosTab
            licitacionId={licitacion.id}
            organizationId={licitacion.organization_id}
            initialDocumentos={documentos}
            modalidadProcedimiento={licitacion.modalidad_procedimiento}
            initialDocumentosConvocanteNoAplica={licitacion.documentos_convocante_no_aplica ?? []}
          />
        </TabsContent>

        <TabsContent value="analisis" className="flex flex-col gap-6">
          <AnalisisIaTab licitacionId={licitacion.id} />
          <ChatDocumento licitacionId={licitacion.id} />
        </TabsContent>

        <TabsContent value="viabilidad">
          <ViabilidadTab licitacionId={licitacion.id} />
        </TabsContent>

        <TabsContent value="partidas">
          <PartidasTab licitacionId={licitacion.id} />
        </TabsContent>

        <TabsContent value="junta">
          <JuntaAclaracionesTab licitacionId={licitacion.id} />
        </TabsContent>

        <TabsContent value="propuesta-tecnica">
          <PropuestaTecnicaTab licitacionId={licitacion.id} />
        </TabsContent>

        <TabsContent value="propuesta-economica">
          <PropuestaEconomicaTab licitacionId={licitacion.id} />
        </TabsContent>

        <TabsContent value="documentos-legales">
          <DocumentosLegalesTab licitacionId={licitacion.id} />
        </TabsContent>

        <TabsContent value="documentos-tecnicos">
          <DocumentosTecnicosTab licitacionId={licitacion.id} />
        </TabsContent>

        <TabsContent value="auditoria">
          <AuditoriaTab licitacionId={licitacion.id} />
        </TabsContent>

        <TabsContent value="liberacion">
          <LiberacionTab
            licitacionId={licitacion.id}
            organizationId={licitacion.organization_id}
            esInvestigacionMercado={licitacion.es_investigacion_mercado}
          />
        </TabsContent>

        <TabsContent value="seguimiento">
          <SeguimientoTab licitacionId={licitacion.id} organizationId={licitacion.organization_id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
