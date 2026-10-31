"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";
import { Tabs } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  CambiosSinGuardarContext,
  useAlmacenCambios,
} from "@/components/licitaciones/cambios-sin-guardar";
import {
  GRUPOS_PESTANAS,
  PESTANA_INICIAL,
  destinoDeEnlace,
  grupoDePestana,
  parsePestana,
  type DestinoSalida,
} from "@/lib/navegacion";

// La pestaña activa se refleja en la URL (`?tab=liberacion`): recargar o volver
// atrás no pierde el lugar, y cualquier aviso puede enlazar a una pestaña.
// La URL se actualiza con history.replaceState (integrado con useSearchParams
// en el router de Next), sin volver a pedir los datos de la página al
// servidor. La pestaña es además estado local para que el cambio sea
// inmediato; si la URL cambia por fuera (un enlace a otra pestaña), se adopta.
//
// Cada pestaña se desmonta al salir de ella. Las que se editan a mano (hoy, la
// propuesta económica) declaran sus cambios sin guardar con
// `useCambiosSinGuardar`; mientras haya alguno, cambiar de pestaña, seguir un
// enlace a otra página de la app o cerrar la pestaña del navegador pide
// confirmación en vez de perderlos en silencio.
export function LicitacionTabsNav({ children }: { children: ReactNode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const almacen = useAlmacenCambios();
  const [pendiente, setPendiente] = useState<DestinoSalida | null>(null);
  const tabEnUrl = parsePestana(searchParams.get("tab"));
  const [tab, setTab] = useState(tabEnUrl);
  const [tabEnUrlPrevia, setTabEnUrlPrevia] = useState(tabEnUrl);
  if (tabEnUrl !== tabEnUrlPrevia) {
    setTabEnUrlPrevia(tabEnUrl);
    setTab(tabEnUrl);
  }
  const grupoActivo = grupoDePestana(tab);

  // El clic de un enlace se atiende en captura, antes que el router de Next:
  // la ref evita re-suscribir el listener en cada cambio de pestaña.
  const tabRef = useRef(tab);
  useEffect(() => {
    tabRef.current = tab;
  }, [tab]);

  useEffect(() => {
    function alHacerClic(ev: MouseEvent) {
      if (ev.defaultPrevented || ev.button !== 0) return;
      if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
      if (!almacen.hayCambios()) return;
      const enlace = (ev.target as Element | null)?.closest?.("a[href]");
      if (!enlace || enlace.getAttribute("target") === "_blank") return;
      const destino = destinoDeEnlace(enlace.getAttribute("href") ?? "", {
        href: window.location.href,
        pestana: tabRef.current,
      });
      if (!destino) return;
      ev.preventDefault();
      ev.stopPropagation();
      setPendiente(destino);
    }
    function alCerrar(ev: BeforeUnloadEvent) {
      if (almacen.hayCambios()) ev.preventDefault();
    }
    document.addEventListener("click", alHacerClic, true);
    window.addEventListener("beforeunload", alCerrar);
    return () => {
      document.removeEventListener("click", alHacerClic, true);
      window.removeEventListener("beforeunload", alCerrar);
    };
  }, [almacen]);

  function pedirIrA(pestana: string) {
    if (pestana !== tab && almacen.hayCambios()) setPendiente({ tipo: "pestana", pestana });
    else irA(pestana);
  }

  function descartarYSalir() {
    const destino = pendiente;
    setPendiente(null);
    if (!destino) return;
    // Ya se decidió descartar: el aviso de cierre de la página no debe volver a
    // saltar mientras la pestaña con cambios termina de desmontarse.
    almacen.descartar();
    if (destino.tipo === "pestana") irA(destino.pestana);
    else router.push(destino.href);
  }

  function irA(pestana: string) {
    setTab(pestana);
    const params = new URLSearchParams(searchParams.toString());
    if (pestana === PESTANA_INICIAL) params.delete("tab");
    else params.set("tab", pestana);
    const qs = params.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }

  return (
    <CambiosSinGuardarContext.Provider value={almacen}>
      <Tabs value={tab} onValueChange={(v) => typeof v === "string" && pedirIrA(v)}>
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
                    onClick={() => pedirIrA(grupo.tabs[0].value)}
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

        <Dialog open={pendiente !== null} onOpenChange={(abierto) => !abierto && setPendiente(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Tienes cambios sin guardar</DialogTitle>
              <DialogDescription>
                Si sales ahora se perderán los cambios que no hayas guardado en esta pestaña.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPendiente(null)}>
                Seguir editando
              </Button>
              <Button variant="destructive" onClick={descartarYSalir}>
                Descartar y salir
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </Tabs>
    </CambiosSinGuardarContext.Provider>
  );
}
