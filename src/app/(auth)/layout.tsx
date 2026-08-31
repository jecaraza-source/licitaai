import Image from "next/image";

const LICITAAI_LOGO = "/branding/licitaai-logo-blanco.png";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh bg-muted/40">
      <aside className="relative hidden w-[43%] overflow-hidden bg-primary p-10 text-primary-foreground lg:flex lg:flex-col lg:justify-between">
        <div className="relative">
          <div className="flex w-full max-w-2xl items-center justify-center rounded-xl bg-primary-foreground px-12 py-10 shadow-xl shadow-black/15 sm:px-16 sm:py-12">
            <Image
              src={LICITAAI_LOGO}
              alt="LicitaAI"
              width={2172}
              height={724}
              priority
              unoptimized
              className="h-auto w-full max-w-[31rem] object-contain"
            />
          </div>
        </div>
        <div className="relative max-w-md pb-8">
          <h2 className="text-4xl font-semibold leading-tight tracking-[-0.04em]">Toma mejores decisiones para ganar más licitaciones.</h2>
          <div className="mt-10 flex flex-col gap-4 text-sm text-primary-foreground/80">
            <p className="flex items-center gap-3"><span className="size-1.5 rounded-full bg-primary-foreground/70" aria-hidden="true" />Detecta oportunidades antes que tu competencia.</p>
            <p className="flex items-center gap-3"><span className="size-1.5 rounded-full bg-primary-foreground/70" aria-hidden="true" />Analiza bases y requisitos en minutos.</p>
            <p className="flex items-center gap-3"><span className="size-1.5 rounded-full bg-primary-foreground/70" aria-hidden="true" />Gestiona tu operación desde un solo lugar.</p>
          </div>
        </div>
        <p className="relative max-w-xl self-center text-center text-lg font-medium leading-7 text-primary-foreground/70">La plataforma inteligente para contratación pública en México.</p>
      </aside>
      <main className="flex flex-1 flex-col items-center justify-center px-5 py-10 sm:px-8">
        <div className="mb-8 flex items-center justify-center lg:hidden">
          <Image
            src="/branding/licitaai-dashboard-horizontal.png"
            alt="LicitaAI"
            width={1774}
            height={887}
            unoptimized
            className="h-14 w-auto object-contain"
          />
        </div>
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  );
}
