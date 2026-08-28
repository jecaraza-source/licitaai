"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const ROL_LABELS: Record<string, string> = {
  EJECUTOR: "Ejecutor",
  INTEGRADOR: "Integrador",
  SUPERVISOR: "Supervisor",
};

const aceptarSchema = z.object({
  nombre: z.string().min(2, "Ingresa tu nombre completo"),
  password: z.string().min(8, "Mínimo 8 caracteres"),
});

type AceptarForm = z.infer<typeof aceptarSchema>;

interface InvitacionInfo {
  organizacion_id: string;
  organizacion_nombre: string;
  email: string;
  rol_jerarquico: string;
  valido: boolean;
}

export default function InvitacionPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const router = useRouter();
  const [invitacion, setInvitacion] = useState<InvitacionInfo | null | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<AceptarForm>({ resolver: zodResolver(aceptarSchema) });

  useEffect(() => {
    const supabase = createClient();
    supabase
      .rpc("invitacion_info", { p_token: token })
      .then(({ data }: { data: InvitacionInfo[] | null }) => {
        setInvitacion(data?.[0] ?? null);
      });
  }, [token]);

  async function onSubmit(values: AceptarForm) {
    if (!invitacion) return;
    setLoading(true);
    const supabase = createClient();

    // organization_id, rol y rol_jerarquico se resuelven server-side en
    // handle_new_user() a partir de la fila de invitaciones_staff (token +
    // correo autenticado), nunca desde este payload — un cliente no puede
    // elegir su propia organización ni rol enviando otros valores aquí.
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email: invitacion.email,
      password: values.password,
      options: {
        data: {
          nombre: values.nombre,
          invite_token: token,
        },
      },
    });

    if (signUpError) {
      setLoading(false);
      toast.error("No se pudo crear la cuenta", { description: signUpError.message });
      return;
    }

    const { error: aceptarError } = await supabase.rpc("aceptar_invitacion_staff", {
      p_token: token,
    });

    setLoading(false);

    if (aceptarError) {
      toast.error("Tu cuenta se creó, pero no se pudo vincular la invitación", {
        description: aceptarError.message,
      });
      return;
    }

    if (signUpData.session) {
      fetch("/api/auth/bienvenida", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: invitacion.email, nombre: values.nombre }),
      }).catch(() => {});
      router.push("/dashboard");
      router.refresh();
      return;
    }

    toast.success("Cuenta creada", {
      description: "Revisa tu correo para confirmar tu cuenta antes de iniciar sesión.",
    });
    router.push("/login");
  }

  if (invitacion === undefined) {
    return <Skeleton className="h-64 w-full" />;
  }

  if (!invitacion || !invitacion.valido) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Invitación no válida</CardTitle>
          <CardDescription>
            Este enlace ya se usó, expiró o no existe. Pide a quien te invitó que te reenvíe una
            invitación nueva.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Únete a {invitacion.organizacion_nombre}</CardTitle>
        <CardDescription>
          Te invitaron como <strong>{ROL_LABELS[invitacion.rol_jerarquico] ?? invitacion.rol_jerarquico}</strong>.
          Crea tu contraseña para activar tu cuenta.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label>Correo electrónico</Label>
            <Input value={invitacion.email} disabled />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="nombre">Nombre completo</Label>
            <Input id="nombre" autoComplete="name" {...register("nombre")} />
            {errors.nombre && (
              <p className="text-sm text-destructive">{errors.nombre.message}</p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="password">Contraseña</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              {...register("password")}
            />
            {errors.password && (
              <p className="text-sm text-destructive">{errors.password.message}</p>
            )}
          </div>
          <Button type="submit" disabled={loading} className="mt-2">
            {loading ? "Creando cuenta…" : "Aceptar invitación y crear cuenta"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
