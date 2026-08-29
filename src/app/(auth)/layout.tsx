import { ArrowUpRight, Landmark, ShieldCheck } from "lucide-react";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-svh bg-muted/40 lg:grid-cols-[minmax(0,1fr)_minmax(420px,0.82fr)]">
      <section className="relative hidden overflow-hidden bg-primary p-10 text-primary-foreground lg:flex lg:flex-col lg:justify-between">
        <div className="relative z-10 flex items-center gap-2.5">
          <span className="flex size-10 items-center justify-center rounded-lg bg-primary-foreground/15 ring-1 ring-primary-foreground/20">
            <Landmark className="size-5" aria-hidden="true" />
          </span>
          <span className="text-xl font-semibold tracking-tight">LicitaAI</span>
        </div>
        <div className="relative z-10 max-w-lg">
          <p className="mb-4 flex items-center gap-2 text-sm font-medium text-primary-foreground/75">
            <ShieldCheck className="size-4" aria-hidden="true" />
            Inteligencia para licitaciones públicas
          </p>
          <h2 className="text-balance text-4xl font-semibold tracking-tight xl:text-5xl">
            Convierte cada oportunidad en una decisión clara.
          </h2>
          <p className="mt-6 max-w-md text-pretty leading-relaxed text-primary-foreground/75">
            Centraliza, analiza y da seguimiento a tus procesos de contratación desde un solo lugar.
          </p>
        </div>
        <p className="relative z-10 flex items-center gap-1 text-sm text-primary-foreground/60">
          LicitaAI para equipos que compiten mejor
          <ArrowUpRight className="size-4" aria-hidden="true" />
        </p>
      </section>
      <section className="flex flex-col items-center justify-center gap-8 p-6 sm:p-10">
        <div className="flex items-center gap-2.5 lg:hidden">
          <span className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Landmark className="size-5" aria-hidden="true" />
          </span>
          <span className="text-xl font-semibold tracking-tight">LicitaAI</span>
        </div>
        <div className="w-full max-w-sm">{children}</div>
      </section>
    </main>
  );
}
