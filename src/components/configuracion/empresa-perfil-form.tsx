"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { toast } from "sonner";
import { Plus, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";
import type { EmpresaPerfil } from "@/types";

type FormState = {
  razon_social: string;
  rfc: string;
  giro: string;
  experiencia_anos: string;
  certificaciones_json: string[];
  clientes_referencia_json: string[];
  logo_url: string | null;
};

const EMPTY: FormState = {
  razon_social: "",
  rfc: "",
  giro: "",
  experiencia_anos: "",
  certificaciones_json: [],
  clientes_referencia_json: [],
  logo_url: null,
};

const NUEVA = "__nueva__";

function empresaToForm(data: EmpresaPerfil): FormState {
  return {
    razon_social: data.razon_social ?? "",
    rfc: data.rfc ?? "",
    giro: data.giro ?? "",
    experiencia_anos: data.experiencia_anos?.toString() ?? "",
    certificaciones_json: (data.certificaciones_json as string[]) ?? [],
    clientes_referencia_json: (data.clientes_referencia_json as string[]) ?? [],
    logo_url: data.logo_url,
  };
}

function DynamicList({
  label,
  items,
  onChange,
}: {
  label: string;
  items: string[];
  onChange: (items: string[]) => void;
}) {
  const [nuevo, setNuevo] = useState("");

  return (
    <div className="flex flex-col gap-2">
      <Label>{label}</Label>
      <div className="flex flex-wrap gap-1.5">
        {items.map((item, i) => (
          <span
            key={i}
            className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs text-secondary-foreground"
          >
            {item}
            <button
              type="button"
              onClick={() => onChange(items.filter((_, idx) => idx !== i))}
              className="text-muted-foreground hover:text-destructive"
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          value={nuevo}
          onChange={(e) => setNuevo(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && nuevo.trim()) {
              e.preventDefault();
              onChange([...items, nuevo.trim()]);
              setNuevo("");
            }
          }}
          placeholder="Escribe y presiona Enter"
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => {
            if (nuevo.trim()) {
              onChange([...items, nuevo.trim()]);
              setNuevo("");
            }
          }}
        >
          <Plus />
        </Button>
      </div>
    </div>
  );
}

export function EmpresaPerfilForm() {
  const router = useRouter();
  const [empresas, setEmpresas] = useState<EmpresaPerfil[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [subiendoLogo, setSubiendoLogo] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/empresa-perfil")
      .then((res) => res.json())
      .then((json) => {
        const data = (json.data as EmpresaPerfil[]) ?? [];
        const activaId = (json.activaId as string | null) ?? null;
        setEmpresas(data);

        const inicial = data.find((e) => e.id === activaId) ?? data[0] ?? null;
        setSelectedId(inicial?.id ?? null);
        setForm(inicial ? empresaToForm(inicial) : EMPTY);
      });

    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      const { data: perfil } = await supabase
        .from("users")
        .select("organization_id")
        .eq("id", user.id)
        .single();
      setOrganizationId(perfil?.organization_id ?? null);
    });
  }, []);

  function handleSelectEmpresa(value: string | null) {
    if (!value || value === NUEVA) {
      setSelectedId(null);
      setForm(EMPTY);
      return;
    }
    const empresa = empresas.find((e) => e.id === value);
    if (!empresa) return;
    setSelectedId(empresa.id);
    setForm(empresaToForm(empresa));

    fetch("/api/empresa-perfil/seleccionar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: empresa.id }),
    }).then((res) => {
      if (res.ok) router.refresh();
    });
  }

  async function handleGuardar() {
    if (!form) return;
    setGuardando(true);

    const payload = {
      ...form,
      experiencia_anos: form.experiencia_anos ? Number(form.experiencia_anos) : null,
    };

    const res = await fetch(selectedId ? `/api/empresa-perfil/${selectedId}` : "/api/empresa-perfil", {
      method: selectedId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    setGuardando(false);

    if (!res.ok) {
      toast.error("No se pudo guardar el perfil");
      return;
    }

    const guardada = json.data as EmpresaPerfil;
    setEmpresas((prev) => {
      const existe = prev.some((e) => e.id === guardada.id);
      return existe ? prev.map((e) => (e.id === guardada.id ? guardada : e)) : [...prev, guardada];
    });
    setSelectedId(guardada.id);

    const nombre = guardada.razon_social?.trim() || "la empresa";
    toast.success(`Perfil de "${nombre}" guardado`);
    router.refresh();
  }

  async function handleLogoUpload(file: File) {
    if (!form) return;
    if (!organizationId) {
      toast.error("Espera un momento", {
        description: "Tu perfil todavía se está cargando, intenta de nuevo en unos segundos.",
      });
      return;
    }
    setSubiendoLogo(true);

    const supabase = createClient();
    const path = `${organizationId}/logo-${Date.now()}.${file.name.split(".").pop()}`;
    const { error: uploadError } = await supabase.storage
      .from("logos-empresa")
      .upload(path, file, { upsert: true });

    if (uploadError) {
      setSubiendoLogo(false);
      toast.error("No se pudo subir el logo", { description: uploadError.message });
      return;
    }

    const { data: publicUrl } = supabase.storage.from("logos-empresa").getPublicUrl(path);
    setForm({ ...form, logo_url: publicUrl.publicUrl });
    setSubiendoLogo(false);
  }

  if (!form) {
    return <Skeleton className="h-96 w-full" />;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Label>Empresa</Label>
        <Select value={selectedId ?? NUEVA} onValueChange={handleSelectEmpresa}>
          <SelectTrigger className="w-full sm:w-80">
            <SelectValue>
              {(value: string | null) =>
                !value || value === NUEVA
                  ? "+ Nueva empresa"
                  : empresas.find((e) => e.id === value)?.razon_social?.trim() ||
                    "Empresa sin nombre"
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {empresas.map((e) => (
              <SelectItem key={e.id} value={e.id}>
                {e.razon_social?.trim() || "Empresa sin nombre"}
              </SelectItem>
            ))}
            <SelectItem value={NUEVA}>+ Nueva empresa</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-2">
        <Label>Logo de la empresa</Label>
        <div className="flex items-center gap-4">
          {form.logo_url ? (
            <Image
              src={form.logo_url}
              alt="Logo"
              width={80}
              height={80}
              className="size-20 rounded-md border object-contain p-1"
            />
          ) : (
            <div className="flex size-20 items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground">
              Sin logo
            </div>
          )}
          <>
            <input
              ref={logoInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleLogoUpload(file);
                e.target.value = "";
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={subiendoLogo}
              onClick={() => logoInputRef.current?.click()}
            >
              <span className="flex items-center gap-1.5">
                <Upload className="size-3.5" />
                {subiendoLogo ? "Subiendo…" : "Subir logo"}
              </span>
            </Button>
          </>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="razon_social">Razón social</Label>
          <Input
            id="razon_social"
            value={form.razon_social}
            onChange={(e) => setForm({ ...form, razon_social: e.target.value })}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="rfc">RFC</Label>
          <Input id="rfc" value={form.rfc} onChange={(e) => setForm({ ...form, rfc: e.target.value })} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="giro">Giro</Label>
          <Input id="giro" value={form.giro} onChange={(e) => setForm({ ...form, giro: e.target.value })} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="experiencia_anos">Años de experiencia</Label>
          <Input
            id="experiencia_anos"
            type="number"
            value={form.experiencia_anos}
            onChange={(e) => setForm({ ...form, experiencia_anos: e.target.value })}
          />
        </div>
      </div>

      <DynamicList
        label="Certificaciones"
        items={form.certificaciones_json}
        onChange={(items) => setForm({ ...form, certificaciones_json: items })}
      />
      <DynamicList
        label="Clientes de referencia"
        items={form.clientes_referencia_json}
        onChange={(items) => setForm({ ...form, clientes_referencia_json: items })}
      />

      <div className="flex justify-end">
        <Button onClick={handleGuardar} disabled={guardando}>
          {guardando ? "Guardando…" : "Guardar perfil"}
        </Button>
      </div>
    </div>
  );
}
