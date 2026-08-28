import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

// P2 · I6 / P2.3 — aviso persistente de que un resultado de IA es un
// borrador que requiere revisión humana. La IA asiste; no declara
// cumplimiento legal definitivo.
export function AvisoRevisionIA({
  aprobado,
  className,
}: {
  /** Si el resultado ya fue aprobado por una persona, el aviso cambia de tono. */
  aprobado?: boolean;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "flex items-start gap-1.5 rounded-md border px-2.5 py-1.5 text-xs",
        aprobado
          ? "border-primary/20 bg-primary/5 text-primary"
          : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
        className,
      )}
    >
      <Info className="mt-0.5 size-3.5 shrink-0" />
      <span>
        {aprobado
          ? "Revisado y aprobado por una persona de tu equipo."
          : "Generado con IA. Es un borrador: revísalo y valídalo antes de usarlo o presentarlo. LicitaAI no declara cumplimiento legal de forma automática."}
      </span>
    </p>
  );
}
