import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AnalisisBases, TipoLicitacion } from "@/types";

const TIPO_LABELS: Record<TipoLicitacion, string> = {
  ADQUISICION: "Adquisición",
  SERVICIOS: "Servicios",
  OBRA_PUBLICA: "Obra pública",
};

type AnalisisResumen = Pick<
  AnalisisBases,
  "objeto_contrato" | "tipo_procedimiento" | "especificaciones_tecnicas_json"
>;

export function ResumenAnexoTecnicoCard({
  tipo,
  esInvestigacionMercado,
  analisis,
}: {
  tipo: TipoLicitacion;
  esInvestigacionMercado: boolean;
  analisis: AnalisisResumen | null;
}) {
  const especificaciones = analisis?.especificaciones_tecnicas_json ?? [];
  const obligatorias = especificaciones.filter((e) => e.obligatorio);
  const destacadas = obligatorias.length > 0 ? obligatorias : especificaciones;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Resumen del procedimiento</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="outline">{TIPO_LABELS[tipo]}</Badge>
          {esInvestigacionMercado && <Badge variant="outline">Investigación de mercado</Badge>}
          {analisis?.tipo_procedimiento && (
            <Badge variant="outline">{analisis.tipo_procedimiento}</Badge>
          )}
        </div>

        {analisis?.objeto_contrato ? (
          <p className="text-sm">{analisis.objeto_contrato}</p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Aún no se ha analizado con IA. Ve a la pestaña <strong>Análisis IA</strong> para
            extraer el objeto del contrato y los puntos clave del Anexo Técnico.
          </p>
        )}

        {destacadas.length > 0 && (
          <div className="flex flex-col gap-1">
            <p className="text-xs font-medium text-muted-foreground">
              Puntos clave del Anexo Técnico
            </p>
            <ul className="flex flex-col gap-0.5 text-sm">
              {destacadas.slice(0, 8).map((e, i) => (
                <li key={i} className="flex gap-1.5">
                  <span className="text-muted-foreground">·</span>
                  <span>
                    {e.especificacion}
                    {e.cantidad ? ` (${e.cantidad})` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
