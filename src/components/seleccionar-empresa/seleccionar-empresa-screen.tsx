"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { toast } from "sonner";
import { Building2, Landmark, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { EmpresaPerfil } from "@/types";

export function SeleccionarEmpresaScreen({ empresas }: { empresas: EmpresaPerfil[] }) {
  const router = useRouter();
  const [cargandoId, setCargandoId] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);
  const [nombreNueva, setNombreNueva] = useState("");
  const [guardandoNueva, setGuardandoNueva] = useState(false);

  async function seleccionar(id: string) {
    setCargandoId(id);
    try {
      const res = await fetch("/api/empresa-perfil/seleccionar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) {
        toast.error("No se pudo seleccionar la empresa");
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } catch {
      toast.error("No se pudo seleccionar la empresa", { description: "Error de red inesperado" });
    } finally {
      setCargandoId(null);
    }
  }

  async function crearNueva() {
    if (!nombreNueva.trim()) return;
    setGuardandoNueva(true);
    try {
      const res = await fetch("/api/empresa-perfil", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ razon_social: nombreNueva.trim() }),
      });
      if (!res.ok) {
        toast.error("No se pudo crear la empresa");
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } catch {
      toast.error("No se pudo crear la empresa", { description: "Error de red inesperado" });
    } finally {
      setGuardandoNueva(false);
    }
  }

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-8 bg-muted/40 p-6">
      <div className="flex items-center gap-2.5">
        <span className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Landmark className="size-5" />
        </span>
        <span className="text-xl font-semibold tracking-tight">LicitaAI</span>
      </div>

      <div className="flex w-full max-w-2xl flex-col gap-4">
        <div className="text-center">
          <h1 className="text-xl font-semibold tracking-tight">¿Con qué empresa vas a trabajar?</h1>
          <p className="text-muted-foreground">
            Elige una empresa para continuar. Puedes cambiarla después desde Configuración.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {empresas.map((empresa) => (
            <button
              key={empresa.id}
              type="button"
              disabled={cargandoId !== null}
              onClick={() => seleccionar(empresa.id)}
              className="flex items-center gap-3 rounded-lg border bg-card p-4 text-left transition-colors hover:border-primary hover:bg-accent disabled:opacity-60"
            >
              {empresa.logo_url ? (
                <Image
                  src={empresa.logo_url}
                  alt={empresa.razon_social ?? "Logo"}
                  width={44}
                  height={44}
                  className="size-11 shrink-0 rounded-md border object-contain p-1"
                />
              ) : (
                <span className="flex size-11 shrink-0 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
                  <Building2 className="size-5" />
                </span>
              )}
              <span className="flex flex-col">
                <span className="font-medium">
                  {empresa.razon_social?.trim() || "Empresa sin nombre"}
                </span>
                {(empresa.giro || empresa.rfc) && (
                  <span className="text-sm text-muted-foreground">
                    {[empresa.giro, empresa.rfc].filter(Boolean).join(" · ")}
                  </span>
                )}
              </span>
              {cargandoId === empresa.id && (
                <Loader2 className="ml-auto size-4 shrink-0 animate-spin text-muted-foreground" />
              )}
            </button>
          ))}
        </div>

        {!creando ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => setCreando(true)}
            className="self-center"
          >
            <Plus className="size-4" />
            Nueva empresa
          </Button>
        ) : (
          <div className="flex flex-col gap-2 rounded-lg border bg-card p-4 sm:flex-row sm:items-end">
            <div className="flex flex-1 flex-col gap-2">
              <Label htmlFor="nombre-nueva-empresa">Nombre de la nueva empresa</Label>
              <Input
                id="nombre-nueva-empresa"
                value={nombreNueva}
                onChange={(e) => setNombreNueva(e.target.value)}
                placeholder="Razón social"
                autoFocus
              />
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setCreando(false)}
                disabled={guardandoNueva}
              >
                Cancelar
              </Button>
              <Button onClick={crearNueva} disabled={guardandoNueva || !nombreNueva.trim()}>
                {guardandoNueva ? "Creando…" : "Crear y continuar"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
