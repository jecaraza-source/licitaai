"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { toast } from "sonner";
import { Plus, Sparkles, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { extraerColoresDominantes } from "@/lib/color-extraction";
import type { DocumentoCorporativo, EmpresaPerfil } from "@/types";

// Claves de FormState que la IA puede prellenar desde documentos
// corporativos (ver datos_extraidos_json / CAMPOS_EXTRA_POR_TIPO en el edge
// function analizar-documento-corporativo). Nunca se pisa un valor que el
// usuario ya haya capturado: solo se llenan campos vacíos.
const CAMPOS_TEXTO_PRELLENABLES = [
  "objeto_social",
  "acta_escritura_numero",
  "acta_escritura_fecha",
  "acta_notario",
  "acta_notaria_numero",
  "acta_notaria_estado",
  "acta_registro_publico",
  "representante_legal_escritura_numero",
  "representante_legal_escritura_fecha",
  "representante_legal_notario",
  "representante_legal_notaria_numero",
  "representante_legal_notaria_estado",
  "representante_legal_registro_publico",
  "domicilio_fiscal",
  "nacionalidad",
  "estratificacion_mipyme",
] as const;

type FormState = {
  razon_social: string;
  rfc: string;
  giro: string;
  experiencia_anos: string;
  certificaciones_json: string[];
  clientes_referencia_json: string[];
  logo_url: string | null;
  color_primario: string | null;
  color_secundario: string | null;
  objeto_social: string;
  acta_escritura_numero: string;
  acta_escritura_fecha: string;
  acta_notario: string;
  acta_notaria_numero: string;
  acta_notaria_estado: string;
  acta_registro_publico: string;
  representante_legal_nombre: string;
  representante_legal_escritura_numero: string;
  representante_legal_escritura_fecha: string;
  representante_legal_notario: string;
  representante_legal_notaria_numero: string;
  representante_legal_notaria_estado: string;
  representante_legal_registro_publico: string;
  domicilio_fiscal: string;
  domicilio_notificaciones: string;
  correo_notificaciones: string;
  nacionalidad: string;
  normas_oficiales_aplican: boolean;
  normas_oficiales_detalle: string;
  cuenta_personal_discapacidad: boolean;
  estratificacion_mipyme: string;
  socios_accionistas_json: string[];
  garantia_tecnica_meses: string;
  garantia_tecnica_detalle: string;
  soporte_tecnico_contacto: string;
  tiempo_inicio_servicio_dias: string;
  personal_tecnico_json: string[];
  infraestructura_equipo_json: string[];
  licencias_permisos_json: string[];
};

const EMPTY: FormState = {
  razon_social: "",
  rfc: "",
  giro: "",
  experiencia_anos: "",
  certificaciones_json: [],
  clientes_referencia_json: [],
  logo_url: null,
  color_primario: null,
  color_secundario: null,
  objeto_social: "",
  acta_escritura_numero: "",
  acta_escritura_fecha: "",
  acta_notario: "",
  acta_notaria_numero: "",
  acta_notaria_estado: "",
  acta_registro_publico: "",
  representante_legal_nombre: "",
  representante_legal_escritura_numero: "",
  representante_legal_escritura_fecha: "",
  representante_legal_notario: "",
  representante_legal_notaria_numero: "",
  representante_legal_notaria_estado: "",
  representante_legal_registro_publico: "",
  domicilio_fiscal: "",
  domicilio_notificaciones: "",
  correo_notificaciones: "",
  nacionalidad: "Mexicana",
  normas_oficiales_aplican: false,
  normas_oficiales_detalle: "",
  cuenta_personal_discapacidad: false,
  estratificacion_mipyme: "",
  socios_accionistas_json: [],
  garantia_tecnica_meses: "",
  garantia_tecnica_detalle: "",
  soporte_tecnico_contacto: "",
  tiempo_inicio_servicio_dias: "",
  personal_tecnico_json: [],
  infraestructura_equipo_json: [],
  licencias_permisos_json: [],
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
    color_primario: data.color_primario,
    color_secundario: data.color_secundario,
    objeto_social: data.objeto_social ?? "",
    acta_escritura_numero: data.acta_escritura_numero ?? "",
    acta_escritura_fecha: data.acta_escritura_fecha ?? "",
    acta_notario: data.acta_notario ?? "",
    acta_notaria_numero: data.acta_notaria_numero ?? "",
    acta_notaria_estado: data.acta_notaria_estado ?? "",
    acta_registro_publico: data.acta_registro_publico ?? "",
    representante_legal_nombre: data.representante_legal_nombre ?? "",
    representante_legal_escritura_numero: data.representante_legal_escritura_numero ?? "",
    representante_legal_escritura_fecha: data.representante_legal_escritura_fecha ?? "",
    representante_legal_notario: data.representante_legal_notario ?? "",
    representante_legal_notaria_numero: data.representante_legal_notaria_numero ?? "",
    representante_legal_notaria_estado: data.representante_legal_notaria_estado ?? "",
    representante_legal_registro_publico: data.representante_legal_registro_publico ?? "",
    domicilio_fiscal: data.domicilio_fiscal ?? "",
    domicilio_notificaciones: data.domicilio_notificaciones ?? "",
    correo_notificaciones: data.correo_notificaciones ?? "",
    nacionalidad: data.nacionalidad || "Mexicana",
    normas_oficiales_aplican: data.normas_oficiales_aplican ?? false,
    normas_oficiales_detalle: data.normas_oficiales_detalle ?? "",
    cuenta_personal_discapacidad: data.cuenta_personal_discapacidad ?? false,
    estratificacion_mipyme: data.estratificacion_mipyme ?? "",
    socios_accionistas_json: (data.socios_accionistas_json as string[]) ?? [],
    garantia_tecnica_meses: data.garantia_tecnica_meses?.toString() ?? "",
    garantia_tecnica_detalle: data.garantia_tecnica_detalle ?? "",
    soporte_tecnico_contacto: data.soporte_tecnico_contacto ?? "",
    tiempo_inicio_servicio_dias: data.tiempo_inicio_servicio_dias?.toString() ?? "",
    personal_tecnico_json: (data.personal_tecnico_json as string[]) ?? [],
    infraestructura_equipo_json: (data.infraestructura_equipo_json as string[]) ?? [],
    licencias_permisos_json: (data.licencias_permisos_json as string[]) ?? [],
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

export function EmpresaPerfilForm({
  onEmpresaChange,
}: {
  onEmpresaChange?: (empresaId: string | null) => void;
}) {
  const router = useRouter();
  const [empresas, setEmpresas] = useState<EmpresaPerfil[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [subiendoLogo, setSubiendoLogo] = useState(false);
  const [modoFormulario, setModoFormulario] = useState(false);
  const [rellenando, setRellenando] = useState(false);
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
        setModoFormulario(!inicial);
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

  useEffect(() => {
    onEmpresaChange?.(selectedId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  function handleNuevaEmpresa() {
    setSelectedId(null);
    setForm(EMPTY);
    setModoFormulario(true);
  }

  function handleCancelar() {
    const anterior = empresas.find((e) => e.id === selectedId) ?? empresas[0] ?? null;
    if (anterior) {
      setSelectedId(anterior.id);
      setForm(empresaToForm(anterior));
    }
    setModoFormulario(false);
  }

  function handleSelectEmpresa(value: string | null) {
    if (!value || value === NUEVA) {
      handleNuevaEmpresa();
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
      acta_escritura_fecha: form.acta_escritura_fecha || null,
      representante_legal_escritura_fecha: form.representante_legal_escritura_fecha || null,
      garantia_tecnica_meses: form.garantia_tecnica_meses ? Number(form.garantia_tecnica_meses) : null,
      tiempo_inicio_servicio_dias: form.tiempo_inicio_servicio_dias
        ? Number(form.tiempo_inicio_servicio_dias)
        : null,
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
    setModoFormulario(false);

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
    const colores = await extraerColoresDominantes(file).catch(() => null);

    setForm((actual) =>
      actual
        ? {
            ...actual,
            logo_url: publicUrl.publicUrl,
            color_primario: colores?.primario ?? actual.color_primario,
            color_secundario: colores?.secundario ?? actual.color_secundario,
          }
        : actual,
    );
    setSubiendoLogo(false);
  }

  async function handleRellenarDesdeDocumentos() {
    if (!selectedId) return;
    setRellenando(true);
    try {
      const res = await fetch(`/api/empresa-perfil/${selectedId}/documentos`);
      if (!res.ok) {
        toast.error("No se pudieron leer los documentos corporativos");
        return;
      }
      const json = await res.json();
      // Los documentos vienen ordenados del más reciente al más antiguo, así
      // que al recorrerlos en ese orden el primer valor encontrado por campo
      // es el del documento más reciente.
      const documentos = (json.data as DocumentoCorporativo[]) ?? [];

      let camposLlenados = 0;
      setForm((actual) => {
        if (!actual) return actual;
        const siguiente = { ...actual };

        for (const doc of documentos) {
          const datos = doc.datos_extraidos_json ?? {};
          for (const campo of CAMPOS_TEXTO_PRELLENABLES) {
            const valor = datos[campo];
            if (siguiente[campo] === "" && typeof valor === "string" && valor) {
              siguiente[campo] = valor;
              camposLlenados++;
            }
          }
          const socios = datos.socios_accionistas_json;
          if (
            siguiente.socios_accionistas_json.length === 0 &&
            Array.isArray(socios) &&
            socios.length > 0
          ) {
            siguiente.socios_accionistas_json = socios as string[];
            camposLlenados++;
          }
        }

        return siguiente;
      });

      if (camposLlenados > 0) {
        toast.success(`Se prellenaron ${camposLlenados} campo(s) desde los documentos corporativos`, {
          description: "Revísalos antes de guardar el perfil.",
        });
      } else {
        toast.info("No había datos nuevos para prellenar", {
          description:
            'Sube o "Extrae datos con IA" en los documentos corporativos (acta, poder, comprobante de domicilio, etc.) desde su sección en Configuración.',
        });
      }
    } finally {
      setRellenando(false);
    }
  }

  if (!form) {
    return <Skeleton className="h-96 w-full" />;
  }

  if (!modoFormulario && selectedId) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setModoFormulario(true)}
          className="text-left text-lg font-medium hover:underline"
        >
          {form.razon_social.trim() || "Empresa sin nombre"}
        </button>
        <div className="flex items-center gap-2">
          {empresas.length > 1 && (
            <Select value={selectedId} onValueChange={handleSelectEmpresa}>
              <SelectTrigger size="sm" className="w-56">
                <SelectValue>
                  {(value: string | null) =>
                    empresas.find((e) => e.id === value)?.razon_social?.trim() ||
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
              </SelectContent>
            </Select>
          )}
          <Button type="button" variant="outline" size="sm" onClick={handleNuevaEmpresa}>
            <Plus className="size-3.5" />
            Nueva empresa
          </Button>
        </div>
      </div>
    );
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

      <div className="flex flex-col gap-4 rounded-lg border p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">Datos legales</h3>
            <p className="text-xs text-muted-foreground">
              Se usan para generar los anexos legales (LEG01-LEG12) de las propuestas: deben coincidir
              con el acta constitutiva y el poder del representante legal.
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!selectedId || rellenando}
            onClick={handleRellenarDesdeDocumentos}
            title={
              selectedId
                ? undefined
                : "Guarda primero el perfil para poder prellenar desde sus documentos corporativos"
            }
          >
            <Sparkles className="size-3.5" />
            {rellenando ? "Prellenando…" : "Prellenar con IA desde documentos corporativos"}
          </Button>
        </div>

        <div className="flex flex-col gap-3">
          <p className="text-xs font-medium text-muted-foreground">Acta constitutiva</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2 sm:col-span-2">
              <Label htmlFor="objeto_social">Objeto social</Label>
              <Input
                id="objeto_social"
                value={form.objeto_social}
                onChange={(e) => setForm({ ...form, objeto_social: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="acta_escritura_numero">Escritura pública número</Label>
              <Input
                id="acta_escritura_numero"
                value={form.acta_escritura_numero}
                onChange={(e) => setForm({ ...form, acta_escritura_numero: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="acta_escritura_fecha">Fecha de la escritura</Label>
              <Input
                id="acta_escritura_fecha"
                type="date"
                value={form.acta_escritura_fecha}
                onChange={(e) => setForm({ ...form, acta_escritura_fecha: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="acta_notario">Notario público</Label>
              <Input
                id="acta_notario"
                value={form.acta_notario}
                onChange={(e) => setForm({ ...form, acta_notario: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="acta_notaria_numero">Notaría número</Label>
              <Input
                id="acta_notaria_numero"
                value={form.acta_notaria_numero}
                onChange={(e) => setForm({ ...form, acta_notaria_numero: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="acta_notaria_estado">Estado de la notaría</Label>
              <Input
                id="acta_notaria_estado"
                value={form.acta_notaria_estado}
                onChange={(e) => setForm({ ...form, acta_notaria_estado: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-2 sm:col-span-2">
              <Label htmlFor="acta_registro_publico">Registro público (folio y fecha)</Label>
              <Input
                id="acta_registro_publico"
                value={form.acta_registro_publico}
                onChange={(e) => setForm({ ...form, acta_registro_publico: e.target.value })}
              />
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <p className="text-xs font-medium text-muted-foreground">
            Representante legal (poder para suscribir proposiciones y contratos)
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2 sm:col-span-2">
              <Label htmlFor="representante_legal_nombre">Nombre completo</Label>
              <Input
                id="representante_legal_nombre"
                value={form.representante_legal_nombre}
                onChange={(e) => setForm({ ...form, representante_legal_nombre: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="representante_legal_escritura_numero">Escritura pública número</Label>
              <Input
                id="representante_legal_escritura_numero"
                value={form.representante_legal_escritura_numero}
                onChange={(e) =>
                  setForm({ ...form, representante_legal_escritura_numero: e.target.value })
                }
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="representante_legal_escritura_fecha">Fecha de la escritura</Label>
              <Input
                id="representante_legal_escritura_fecha"
                type="date"
                value={form.representante_legal_escritura_fecha}
                onChange={(e) =>
                  setForm({ ...form, representante_legal_escritura_fecha: e.target.value })
                }
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="representante_legal_notario">Notario público</Label>
              <Input
                id="representante_legal_notario"
                value={form.representante_legal_notario}
                onChange={(e) => setForm({ ...form, representante_legal_notario: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="representante_legal_notaria_numero">Notaría número</Label>
              <Input
                id="representante_legal_notaria_numero"
                value={form.representante_legal_notaria_numero}
                onChange={(e) =>
                  setForm({ ...form, representante_legal_notaria_numero: e.target.value })
                }
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="representante_legal_notaria_estado">Estado de la notaría</Label>
              <Input
                id="representante_legal_notaria_estado"
                value={form.representante_legal_notaria_estado}
                onChange={(e) =>
                  setForm({ ...form, representante_legal_notaria_estado: e.target.value })
                }
              />
            </div>
            <div className="flex flex-col gap-2 sm:col-span-2">
              <Label htmlFor="representante_legal_registro_publico">
                Registro público (folio y fecha)
              </Label>
              <Input
                id="representante_legal_registro_publico"
                value={form.representante_legal_registro_publico}
                onChange={(e) =>
                  setForm({ ...form, representante_legal_registro_publico: e.target.value })
                }
              />
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <p className="text-xs font-medium text-muted-foreground">Domicilio y contacto</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="domicilio_fiscal">Domicilio fiscal</Label>
              <Input
                id="domicilio_fiscal"
                value={form.domicilio_fiscal}
                onChange={(e) => setForm({ ...form, domicilio_fiscal: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="domicilio_notificaciones">
                Domicilio para oír y recibir notificaciones (si es distinto al fiscal)
              </Label>
              <Input
                id="domicilio_notificaciones"
                value={form.domicilio_notificaciones}
                onChange={(e) => setForm({ ...form, domicilio_notificaciones: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="correo_notificaciones">Correo electrónico para notificaciones</Label>
              <Input
                id="correo_notificaciones"
                type="email"
                value={form.correo_notificaciones}
                onChange={(e) => setForm({ ...form, correo_notificaciones: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="nacionalidad">Nacionalidad</Label>
              <Input
                id="nacionalidad"
                value={form.nacionalidad}
                onChange={(e) => setForm({ ...form, nacionalidad: e.target.value })}
              />
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <p className="text-xs font-medium text-muted-foreground">Declaraciones</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="estratificacion_mipyme">
                Estratificación MIPYME (Microempresa, Pequeña empresa, Mediana empresa)
              </Label>
              <Input
                id="estratificacion_mipyme"
                value={form.estratificacion_mipyme}
                onChange={(e) => setForm({ ...form, estratificacion_mipyme: e.target.value })}
              />
            </div>
          </div>
          <DynamicList
            label="Socios / accionistas con control sobre la sociedad (nombre y porcentaje)"
            items={form.socios_accionistas_json}
            onChange={(items) => setForm({ ...form, socios_accionistas_json: items })}
          />
          <div className="flex items-start gap-2">
            <Checkbox
              id="normas_oficiales_aplican"
              checked={form.normas_oficiales_aplican}
              onCheckedChange={(checked) =>
                setForm({ ...form, normas_oficiales_aplican: checked === true })
              }
            />
            <Label htmlFor="normas_oficiales_aplican" className="font-normal">
              Se requiere el cumplimiento de alguna Norma Oficial Mexicana o norma internacional de
              referencia
            </Label>
          </div>
          {form.normas_oficiales_aplican && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="normas_oficiales_detalle">Detalle de las normas aplicables</Label>
              <Input
                id="normas_oficiales_detalle"
                value={form.normas_oficiales_detalle}
                onChange={(e) => setForm({ ...form, normas_oficiales_detalle: e.target.value })}
              />
            </div>
          )}
          <div className="flex items-start gap-2">
            <Checkbox
              id="cuenta_personal_discapacidad"
              checked={form.cuenta_personal_discapacidad}
              onCheckedChange={(checked) =>
                setForm({ ...form, cuenta_personal_discapacidad: checked === true })
              }
            />
            <Label htmlFor="cuenta_personal_discapacidad" className="font-normal">
              La empresa cuenta con personal con discapacidad
            </Label>
          </div>
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

      <div className="flex flex-col gap-4 rounded-lg border p-4">
        <div>
          <h3 className="text-sm font-semibold">Datos técnicos</h3>
          <p className="text-xs text-muted-foreground">
            Se usan para generar los documentos técnicos (TEC01-TEC08) de las propuestas: garantía,
            soporte, infraestructura y personal asignado.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="garantia_tecnica_meses">Garantía técnica (meses)</Label>
            <Input
              id="garantia_tecnica_meses"
              type="number"
              value={form.garantia_tecnica_meses}
              onChange={(e) => setForm({ ...form, garantia_tecnica_meses: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="tiempo_inicio_servicio_dias">
              Tiempo de inicio del servicio (días naturales)
            </Label>
            <Input
              id="tiempo_inicio_servicio_dias"
              type="number"
              value={form.tiempo_inicio_servicio_dias}
              onChange={(e) => setForm({ ...form, tiempo_inicio_servicio_dias: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-2 sm:col-span-2">
            <Label htmlFor="garantia_tecnica_detalle">Detalle de la garantía técnica</Label>
            <Input
              id="garantia_tecnica_detalle"
              value={form.garantia_tecnica_detalle}
              onChange={(e) => setForm({ ...form, garantia_tecnica_detalle: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-2 sm:col-span-2">
            <Label htmlFor="soporte_tecnico_contacto">
              Contacto de soporte técnico y mantenimiento
            </Label>
            <Input
              id="soporte_tecnico_contacto"
              value={form.soporte_tecnico_contacto}
              onChange={(e) => setForm({ ...form, soporte_tecnico_contacto: e.target.value })}
            />
          </div>
        </div>

        <DynamicList
          label="Infraestructura y equipo"
          items={form.infraestructura_equipo_json}
          onChange={(items) => setForm({ ...form, infraestructura_equipo_json: items })}
        />
        <DynamicList
          label="Personal técnico asignado (nombre y puesto)"
          items={form.personal_tecnico_json}
          onChange={(items) => setForm({ ...form, personal_tecnico_json: items })}
        />
        <DynamicList
          label="Licencias y permisos técnicos vigentes"
          items={form.licencias_permisos_json}
          onChange={(items) => setForm({ ...form, licencias_permisos_json: items })}
        />
      </div>

      <div className="flex justify-end gap-2">
        {empresas.length > 0 && (
          <Button type="button" variant="ghost" onClick={handleCancelar} disabled={guardando}>
            Cancelar
          </Button>
        )}
        <Button onClick={handleGuardar} disabled={guardando}>
          {guardando ? "Guardando…" : "Guardar perfil"}
        </Button>
      </div>
    </div>
  );
}
