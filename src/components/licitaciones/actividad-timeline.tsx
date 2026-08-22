import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ActividadLog } from "@/types";

const ACCION_LABELS: Record<string, string> = {
  creacion: "creó la licitación",
  edicion: "editó los datos generales",
  cambio_estado: "cambió el estado",
};

export type ActividadLogConUsuario = ActividadLog & { usuario_nombre: string | null };

function describe(log: ActividadLogConUsuario) {
  if (log.accion === "cambio_estado") {
    const meta = log.metadata_json as { estado_anterior?: string; nuevo_estado?: string };
    return `cambió el estado de "${meta.estado_anterior ?? "—"}" a "${meta.nuevo_estado ?? "—"}"`;
  }
  return ACCION_LABELS[log.accion] ?? log.accion;
}

export function ActividadTimeline({ actividad }: { actividad: ActividadLogConUsuario[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Actividad</CardTitle>
      </CardHeader>
      <CardContent>
        {actividad.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin actividad registrada.</p>
        ) : (
          <ol className="flex flex-col gap-3">
            {actividad.map((log) => (
              <li key={log.id} className="flex items-start gap-3 text-sm">
                <div className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
                <div>
                  <p>
                    <span className="font-medium">{log.usuario_nombre ?? "Alguien"}</span>{" "}
                    {describe(log)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Intl.DateTimeFormat("es-MX", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(new Date(log.created_at))}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
