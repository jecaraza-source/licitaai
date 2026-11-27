import Image from "next/image";
import { CalendarClock, ClipboardCheck, FileSearch } from "lucide-react";

const LICITAAI_LOGO = "/branding/licitaai-logo-blanco.png";

const PUNTOS = [
  { icon: FileSearch, texto: "Analiza bases y requisitos en minutos." },
  { icon: ClipboardCheck, texto: "Revisa cada requisito antes de enviar." },
  { icon: CalendarClock, texto: "No pierdas una fecha: todo en un solo lugar." },
];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh bg-background">
      <aside className="relative hidden w-[46%] max-w-[44rem] overflow-hidden bg-primary p-12 text-primary-foreground lg:flex lg:flex-col lg:justify-between">
        {/* Fondo: dos luces de la marca y una retícula apenas visible. */}
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[radial-gradient(110%_70%_at_0%_0%,color-mix(in_oklab,var(--primary),white_16%),transparent_60%),radial-gradient(90%_70%_at_100%_100%,color-mix(in_oklab,var(--primary),black_38%),transparent_70%)]"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-[0.07] [background-image:linear-gradient(white_1px,transparent_1px),linear-gradient(90deg,white_1px,transparent_1px)] [background-size:44px_44px] [mask-image:radial-gradient(70%_60%_at_30%_30%,black,transparent)]"
        />

        <div className="relative">
          <div className="inline-flex rounded-2xl bg-white px-6 py-4 shadow-[0_10px_30px_-12px_rgb(0_0_0/0.45)]">
            <Image
              src={LICITAAI_LOGO}
              alt="LicitaAI"
              width={2172}
              height={724}
              priority
              unoptimized
              className="h-11 w-auto object-contain"
            />
          </div>
        </div>

        <div className="relative max-w-lg">
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.18em] text-primary-foreground/70">
            Contratación pública en México
          </p>
          <h2 className="text-[2.6rem] leading-[1.08] font-semibold tracking-[-0.03em] text-balance">
            Toma mejores decisiones para ganar más licitaciones.
          </h2>
          <ul className="mt-10 flex flex-col gap-4">
            {PUNTOS.map(({ icon: Icono, texto }) => (
              <li key={texto} className="flex items-center gap-3.5 text-[0.9375rem] text-primary-foreground/90">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-white/12 ring-1 ring-white/20">
                  <Icono className="size-[18px]" aria-hidden="true" />
                </span>
                {texto}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-sm text-primary-foreground/60">
          Federal (Compras MX) · Estado de México (EDCA) · Ciudad de México (SCA)
        </p>
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
        <div className="w-full max-w-[26rem]">{children}</div>
      </main>
    </div>
  );
}
