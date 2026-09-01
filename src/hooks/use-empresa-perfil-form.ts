"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { extraerColoresDominantes } from "@/lib/color-extraction";
import type { DocumentoCorporativo, EmpresaPerfil } from "@/types";

// Claves de FormState que la IA puede prellenar desde documentos
// corporativos (ver datos_extraidos_json / CAMPOS_EXTRA_POR_TIPO en el edge
// function analizar-documento-corporativo). Nunca se pisa un valor que el
// usuario ya haya capturado: solo se llenan campos vacíos.
export const CAMPOS_TEXTO_PRELLENABLES = [
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

export type FormState = {
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

/** Función genérica para actualizar un campo del form y despejar su resaltado de "sin extraer". */
export type SetCampo = <K extends keyof FormState>(campo: K, valor: FormState[K]) => void;

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

// Estado y lógica del perfil de empresa, compartidos entre EmpresaPerfilForm
// ("Perfil de empresa") y la pestaña "Otros datos" de DocumentosCorporativosCard
// ("Documentos corporativos") — ambos editan el mismo registro y se guardan
// juntos con un solo botón "Guardar perfil", así que el estado vive en el
// ancestro común (ConfiguracionEmpresa) y se llama una sola vez.
export function useEmpresaPerfilForm() {
  const router = useRouter();
  const [empresas, setEmpresas] = useState<EmpresaPerfil[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [subiendoLogo, setSubiendoLogo] = useState(false);
  const [modoFormulario, setModoFormulario] = useState(false);
  const [rellenando, setRellenando] = useState(false);
  // Campos prellenables (ver CAMPOS_TEXTO_PRELLENABLES) que, tras el último
  // "Prellenar con IA", siguieron vacíos porque ningún documento traía un
  // valor para ellos — se resaltan en rojo para que el usuario sepa cuáles
  // debe capturar a mano. Se despeja un campo en cuanto el usuario lo edita.
  const [camposSinExtraer, setCamposSinExtraer] = useState<Set<string>>(new Set());

  const setCampo: SetCampo = (campo, valor) => {
    setForm((actual) => (actual ? { ...actual, [campo]: valor } : actual));
    setCamposSinExtraer((prev) => {
      if (!prev.has(campo as string)) return prev;
      const siguiente = new Set(prev);
      siguiente.delete(campo as string);
      return siguiente;
    });
  };

  useEffect(() => {
    fetch("/api/empresa-perfil")
      .then((res) => res.json())
      .then((json) => {
        const data = (json.data?.data as EmpresaPerfil[]) ?? [];
        const activaId = (json.data?.activaId as string | null) ?? null;
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

  function handleEditar() {
    setModoFormulario(true);
  }

  function handleNuevaEmpresa() {
    setSelectedId(null);
    setForm(EMPTY);
    setModoFormulario(true);
    setCamposSinExtraer(new Set());
  }

  function handleCancelar() {
    const anterior = empresas.find((e) => e.id === selectedId) ?? empresas[0] ?? null;
    if (anterior) {
      setSelectedId(anterior.id);
      setForm(empresaToForm(anterior));
    }
    setModoFormulario(false);
    setCamposSinExtraer(new Set());
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
    setCamposSinExtraer(new Set());

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
      toast.error("No se pudo guardar el perfil", { description: json.error?.message });
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
    if (!selectedId || !form) return;
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

      const siguiente = { ...form };
      let camposLlenados = 0;

      for (const doc of documentos) {
        const datos = doc.datos_extraidos_json ?? {};
        for (const campo of CAMPOS_TEXTO_PRELLENABLES) {
          const valor = datos[campo];
          if (siguiente[campo] === "" && typeof valor === "string" && valor) {
            siguiente[campo] = valor;
            camposLlenados++;
          }
        }
        // `nombre_persona_detectado` es una columna propia del documento
        // (no vive en datos_extraidos_json): el nombre del titular de una
        // identificación oficial, o del apoderado en un poder. Solo se usa
        // para representante_legal_nombre cuando viene del poder — de lo
        // contrario se copiaría el nombre de la identificación oficial,
        // que no siempre es la misma persona que el representante.
        if (
          siguiente.representante_legal_nombre === "" &&
          doc.tipo === "Poder del representante legal" &&
          doc.nombre_persona_detectado
        ) {
          siguiente.representante_legal_nombre = doc.nombre_persona_detectado;
          camposLlenados++;
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

      setForm(siguiente);

      // Campos que el prellenado intenta llenar y que, tras procesar todos
      // los documentos disponibles, siguieron vacíos: se resaltan en rojo
      // para que el usuario sepa cuáles capturar a mano.
      const sinExtraer = new Set<string>(
        [...CAMPOS_TEXTO_PRELLENABLES, "representante_legal_nombre"].filter(
          (campo) => siguiente[campo as keyof FormState] === "",
        ),
      );
      if (siguiente.socios_accionistas_json.length === 0) {
        sinExtraer.add("socios_accionistas_json");
      }
      setCamposSinExtraer(sinExtraer);

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

  return {
    empresas,
    selectedId,
    form,
    guardando,
    subiendoLogo,
    modoFormulario,
    rellenando,
    camposSinExtraer,
    setForm,
    setCampo,
    handleEditar,
    handleNuevaEmpresa,
    handleCancelar,
    handleSelectEmpresa,
    handleGuardar,
    handleLogoUpload,
    handleRellenarDesdeDocumentos,
  };
}

export type EmpresaPerfilFormState = ReturnType<typeof useEmpresaPerfilForm>;
