"use client";

import { useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";
import { Tabs } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  GRUPOS_PESTANAS,
  PESTANA_INICIAL,
  grupoDePestana,
  parsePestana,
} from "@/lib/navegacion";

// La pestaña activa se refleja en la URL (`?tab=liberacion`): recargar o volver
// atrás no pierde el lugar, y cualquier aviso puede enlazar a una pestaña.
// La URL se actualiza con history.replaceState (integrado con useSearchParams
// en el router de Next), sin volver a pedir los datos de la página al
// servidor. La pestaña es además estado local para que el cambio sea
// inmediato; si la URL cambia por fuera (un enlace a otra pestaña), se adopta.
export function LicitacionTabsNav({ children }: { children: ReactNode }) {
  const searchParams = useSearchParams();
  const tabEnUrl = parsePestana(searchParams.get("tab"));
  const [tab, setTab] = useState(tabEnUrl);
  const [tabEnUrlPrevia, setTabEnUrlPrevia] = useState(tabEnUrl);
  if (tabEnUrl !== tabEnUrlPrevia) {
    setTabEnUrlPrevia(tabEnUrl);
    setTab(tabEnUrl);
  }
  const grupoActivo = grupoDePestana(tab);

  function irA(pestana: string) {
    setTab(pestana);
    const params = new URLSearchParams(searchParams.toString());
    if (pestana === PESTANA_INICIAL) params.delete("tab");
    else params.set("tab", pestana);
    const qs = params.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }

  return (
    <Tabs value={tab} onValueChange={(v) => typeof v === "string" && irA(v)}>
      <div className="flex flex-col gap-1.5">
        <nav aria-label="Secciones de la licitación" className="-mx-1 overflow-x-auto px-1 pb-1">
          <div className="flex w-max gap-1 rounded-lg bg-muted p-[3px]">
            {GRUPOS_PESTANAS.map((grupo) => {
              const activo = grupo === grupoActivo;
              return (
                <button
                  key={grupo.label}
                  type="button"
                  aria-current={activo ? "true" : undefined}
                  onClick={() => irA(grupo.tabs[0].value)}
                  className={cn(
                    "whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                    activo
                      ? "scale-[1.03] bg-primary text-primary-foreground shadow-md"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {grupo.label}
                </button>
              );
            })}
          </div>
        </nav>

        {/* Segundo nivel: pestañas reales (role="tab", aria-selected y flechas
            del teclado). Si el grupo tiene una sola, la lista queda oculta a la
            vista pero presente, para que el panel siga etiquetado. */}
        <div className="-mx-1 overflow-x-auto px-1">
          <TabsPrimitive.List
            aria-label={grupoActivo.label}
            className={cn("flex w-max gap-3", grupoActivo.tabs.length > 1 ? "border-b" : "sr-only")}
          >
            {grupoActivo.tabs.map((t) => (
              <TabsPrimitive.Tab
                key={t.value}
                value={t.value}
                className="-mb-px whitespace-nowrap border-b-2 border-transparent px-1 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring data-active:border-primary data-active:font-semibold data-active:text-primary"
              >
                {t.label}
              </TabsPrimitive.Tab>
            ))}
          </TabsPrimitive.List>
        </div>
      </div>

      {children}
    </Tabs>
  );
}
