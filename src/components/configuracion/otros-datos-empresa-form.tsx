"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DynamicList } from "@/components/configuracion/empresa-perfil-form";
import type { FormState, SetCampo } from "@/hooks/use-empresa-perfil-form";

// Certificaciones, clientes de referencia y datos técnicos de la empresa —
// se muestran junto a los documentos corporativos porque, igual que ellos,
// alimentan las propuestas técnicas (TEC01-TEC08) más que el alta de la
// empresa en sí. Comparten el mismo `form`/`setCampo` que EmpresaPerfilForm
// (useEmpresaPerfilForm, instanciado una sola vez en ConfiguracionEmpresa),
// así que se guardan juntos con el botón "Guardar perfil" de esa tarjeta.
export function OtrosDatosEmpresaForm({
  form,
  setCampo,
}: {
  form: FormState;
  setCampo: SetCampo;
}) {
  return (
    <div className="flex flex-col gap-6">
      <DynamicList
        label="Certificaciones"
        items={form.certificaciones_json}
        onChange={(items) => setCampo("certificaciones_json", items)}
      />
      <DynamicList
        label="Clientes de referencia"
        items={form.clientes_referencia_json}
        onChange={(items) => setCampo("clientes_referencia_json", items)}
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
              onChange={(e) => setCampo("garantia_tecnica_meses", e.target.value)}
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
              onChange={(e) => setCampo("tiempo_inicio_servicio_dias", e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2 sm:col-span-2">
            <Label htmlFor="garantia_tecnica_detalle">Detalle de la garantía técnica</Label>
            <Input
              id="garantia_tecnica_detalle"
              value={form.garantia_tecnica_detalle}
              onChange={(e) => setCampo("garantia_tecnica_detalle", e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2 sm:col-span-2">
            <Label htmlFor="soporte_tecnico_contacto">
              Contacto de soporte técnico y mantenimiento
            </Label>
            <Input
              id="soporte_tecnico_contacto"
              value={form.soporte_tecnico_contacto}
              onChange={(e) => setCampo("soporte_tecnico_contacto", e.target.value)}
            />
          </div>
        </div>

        <DynamicList
          label="Infraestructura y equipo"
          items={form.infraestructura_equipo_json}
          onChange={(items) => setCampo("infraestructura_equipo_json", items)}
        />
        <DynamicList
          label="Personal técnico asignado (nombre y puesto)"
          items={form.personal_tecnico_json}
          onChange={(items) => setCampo("personal_tecnico_json", items)}
        />
        <DynamicList
          label="Licencias y permisos técnicos vigentes"
          items={form.licencias_permisos_json}
          onChange={(items) => setCampo("licencias_permisos_json", items)}
        />
      </div>
    </div>
  );
}
