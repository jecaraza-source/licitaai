import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EstadoBadge } from "@/components/licitaciones/estado-badge";
import { EstadoSelector } from "@/components/licitaciones/estado-selector";
import { ProcesoTimeline } from "@/components/licitaciones/proceso-timeline";
import { ResumenAnexoTecnicoCard } from "@/components/licitaciones/resumen-anexo-tecnico-card";
import { ActividadTimeline, type ActividadLogConUsuario } from "@/components/licitaciones/actividad-timeline";
import { DocumentosTab } from "@/components/licitaciones/documentos-tab";
import { AnalisisIaTab } from "@/components/licitaciones/analisis-ia-tab";
import { ChatDocumento } from "@/components/licitaciones/chat-documento";
import { PartidasTab } from "@/components/licitaciones/partidas-tab";
import { JuntaAclaracionesTab } from "@/components/licitaciones/junta-aclaraciones-tab";
import { ViabilidadTab } from "@/components/licitaciones/viabilidad-tab";
import { ResponsabilidadesCard } from "@/components/licitaciones/responsabilidades-card";
import { PropuestaTecnicaTab } from "@/components/licitaciones/propuesta-tecnica-tab";
import { PropuestaEconomicaTab } from "@/components/licitaciones/propuesta-economica-tab";
import { AuditoriaTab } from "@/components/licitaciones/auditoria-tab";
import { LiberacionTab } from "@/components/licitaciones/liberacion-tab";
import { SeguimientoTab } from "@/components/licitaciones/seguimiento-tab";
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
  { value: "auditoria", label: "Auditoría" },
  { value: "liberacion", label: "Liberación" },
  { value: "junta", label: "Junta de Aclaraciones" },
  { value: "seguimiento", label: "Seguimiento" },
];

function formatMonto(monto: number | null) {
  if (monto === null) return "—";
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(monto);
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

      <Tabs defaultValue="resumen">
        <TabsList className="flex-wrap">
          {TABS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

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
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle>Monto máximo</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{formatMonto(licitacion.monto_maximo)}</p>
              </CardContent>
            </Card>
            <div className="lg:col-span-2">
              <ActividadTimeline actividad={actividad} />
            </div>
          </div>
          <ResponsabilidadesCard licitacionId={licitacion.id} />
        </TabsContent>

        <TabsContent value="documentos">
          <DocumentosTab
            licitacionId={licitacion.id}
            organizationId={licitacion.organization_id}
            initialDocumentos={documentos}
            modalidadProcedimiento={licitacion.modalidad_procedimiento}
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
