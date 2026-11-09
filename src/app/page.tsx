import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  CalendarClock,
  ClipboardCheck,
  FileSearch,
  FileSignature,
  History,
  ShieldCheck,
  UserCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: { absolute: "LicitaAI | Licitaciones públicas, sin que se te escape nada" },
  description:
    "LicitaAI lee las bases, ayuda a armar tu propuesta y revisa cada requisito antes de enviarla a Compras MX. Federal, Estado de México y CDMX.",
  openGraph: {
    title: "LicitaAI | Licitaciones públicas, sin que se te escape nada",
    description:
      "Analiza las bases, arma la propuesta y revisa cada requisito antes de enviarla a Compras MX.",
    locale: "es_MX",
    type: "website",
  },
};

const PASOS = [
  {
    icon: FileSearch,
    titulo: "Analiza las bases",
    texto:
      "Sube las bases y sus anexos. La IA extrae requisitos, fechas y criterios de evaluación, con citas al documento de origen.",
  },
  {
    icon: FileSignature,
    titulo: "Arma la propuesta",
    texto:
      "Propuesta técnica y económica a partir de las partidas, el estudio de mercado y los documentos corporativos de tu empresa.",
  },
  {
    icon: ClipboardCheck,
    titulo: "Revisa antes de enviar",
    texto:
      "Auditoría documental y checklist de liberación. Una licitación no pasa a Enviada con requisitos en rojo o puntos sin confirmar.",
  },
  {
    icon: CalendarClock,
    titulo: "Da seguimiento",
    texto:
      "Alertas de vencimiento, el historial de cada licitación y el registro del fallo en un solo lugar.",
  },
];

const CONTROLES = [
  {
    icon: UserCheck,
    titulo: "La IA propone, tu equipo aprueba",
    texto: "Puedes exigir que cada resultado de IA se apruebe o se rechace a mano antes de poder enviar la propuesta.",
  },
  {
    icon: ShieldCheck,
    titulo: "Revisión independiente",
    texto: "Puedes exigir que alguien distinto de quien elaboró la propuesta la confirme; si cambia después, hay que revisarla de nuevo.",
  },
  {
    icon: History,
    titulo: "Bitácora que no se edita",
    texto: "El envío y las excepciones quedan registrados con quién y cuándo, sin posibilidad de modificarlos.",
  },
];

export default function Inicio() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/" aria-label="LicitaAI, inicio">
            <Image
              src="/branding/licitaai-dashboard-horizontal.png"
              alt="LicitaAI"
              width={1774}
              height={887}
              priority
              unoptimized
              className="h-12 w-auto object-contain mix-blend-multiply"
            />
          </Link>
          <nav aria-label="Principal" className="flex items-center gap-1 sm:gap-4">
            <a href="#como-funciona" className="hidden px-2 text-sm text-muted-foreground transition-colors hover:text-foreground sm:block">
              Cómo funciona
            </a>
            <a href="#control" className="hidden px-2 text-sm text-muted-foreground transition-colors hover:text-foreground sm:block">
              Control
            </a>
            <Button nativeButton={false} render={<Link href="/login">Iniciar sesión</Link>} />
          </nav>
        </div>
      </header>

      <main>
        <section className="mx-auto grid w-full max-w-6xl items-center gap-10 px-4 py-14 sm:px-6 md:py-20 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-primary">
              Licitaciones públicas en México
            </p>
            <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
              Participa en licitaciones públicas sin que se te escape nada
            </h1>
            <p className="mt-5 max-w-xl text-lg text-muted-foreground text-pretty">
              LicitaAI lee las bases, ayuda a armar tu propuesta y revisa cada requisito antes de enviarla a
              Compras MX. Tu equipo decide; la plataforma lleva la cuenta de lo que falta y de lo que vence.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button
                size="lg"
                nativeButton={false}
                className="h-11 gap-2 px-5"
                render={
                  <Link href="/login">
                    Iniciar sesión
                    <ArrowRight className="size-4" aria-hidden="true" />
                  </Link>
                }
              />
              <Button
                size="lg"
                variant="outline"
                nativeButton={false}
                className="h-11 px-5"
                render={<a href="mailto:contacto@licitaai.mx">Escríbenos</a>}
              />
            </div>
            <p className="mt-4 text-sm text-muted-foreground">
              Federal (Compras MX), Estado de México (EDCA) y Ciudad de México (SCA).
            </p>
          </div>

          {/* Vista ilustrativa del panel "Siguiente paso" de la ficha de una licitación. */}
          <figure className="relative">
            <div className="rounded-2xl border bg-card p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Siguiente paso</p>
                  <p className="mt-1 font-semibold">Faltan 3 cosas para poder enviar</p>
                </div>
                <span className="shrink-0 rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold text-secondary-foreground">
                  Entrega en 6 días
                </span>
              </div>
              <ul className="mt-4 flex flex-col gap-2 text-sm">
                {[
                  ["2 requisitos en rojo", "Auditoría"],
                  ["3 puntos del checklist sin confirmar", "Liberación"],
                  ["Falta la autorización del supervisor", "Liberación"],
                ].map(([texto, donde]) => (
                  <li key={texto} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
                    <span>{texto}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{donde}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-4 inline-flex h-8 items-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground">
                Empezar por el primero
              </div>
            </div>
            <figcaption className="mt-2 text-center text-xs text-muted-foreground">
              Ejemplo ilustrativo de la ficha de una licitación.
            </figcaption>
          </figure>
        </section>

        <section id="como-funciona" className="border-t bg-muted/40">
          <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 md:py-16">
            <h2 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
              Del análisis de las bases al envío
            </h2>
            <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {PASOS.map(({ icon: Icono, titulo, texto }) => (
                <li key={titulo} className="rounded-xl border bg-card p-5">
                  <span className="flex size-9 items-center justify-center rounded-lg bg-secondary text-primary">
                    <Icono className="size-5" aria-hidden="true" />
                  </span>
                  <h3 className="mt-4 font-semibold">{titulo}</h3>
                  <p className="mt-1.5 text-sm text-muted-foreground">{texto}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="control" className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 md:py-16">
          <div className="max-w-2xl">
            <h2 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
              Control, no piloto automático
            </h2>
            <p className="mt-3 text-muted-foreground text-pretty">
              Una licitación se pierde por un requisito que nadie revisó. LicitaAI pone a una persona en cada
              decisión que importa y deja constancia de ella.
            </p>
          </div>
          <ul className="mt-8 grid gap-4 md:grid-cols-3">
            {CONTROLES.map(({ icon: Icono, titulo, texto }) => (
              <li key={titulo} className="flex gap-3">
                <Icono className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
                <div>
                  <h3 className="font-semibold">{titulo}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{texto}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="border-t">
          <div className="mx-auto flex w-full max-w-6xl flex-col items-start justify-between gap-5 px-4 py-12 sm:px-6 md:flex-row md:items-center">
            <div>
              <h2 className="text-xl font-semibold tracking-tight">¿Ya tienes cuenta?</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Entra para ver tus licitaciones. ¿Quieres conocer LicitaAI?{" "}
                <a href="mailto:contacto@licitaai.mx" className="font-medium text-primary underline-offset-4 hover:underline">
                  contacto@licitaai.mx
                </a>
              </p>
            </div>
            <Button size="lg" nativeButton={false} className="h-11 px-5" render={<Link href="/login">Iniciar sesión</Link>} />
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm text-muted-foreground sm:px-6">
          <p>© {new Date().getFullYear()} LicitaAI</p>
          <nav aria-label="Información" className="flex flex-wrap gap-x-5 gap-y-1">
            <Link href="/aviso-privacidad" className="transition-colors hover:text-foreground">
              Aviso de privacidad
            </Link>
            <Link href="/estado" className="transition-colors hover:text-foreground">
              Estado del servicio
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
