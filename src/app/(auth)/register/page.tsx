"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const registerSchema = z.object({
  organizacion: z.string().min(2, "Ingresa el nombre de tu empresa"),
  nombre: z.string().min(2, "Ingresa tu nombre completo"),
  email: z.string().email("Correo inválido"),
  password: z.string().min(8, "Mínimo 8 caracteres"),
});

type RegisterForm = z.infer<typeof registerSchema>;

export default function RegisterPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterForm>({ resolver: zodResolver(registerSchema) });

  async function onSubmit(values: RegisterForm) {
    setLoading(true);
    const supabase = createClient();

    const { data: organizationId, error: orgError } = await supabase.rpc(
      "create_organization_for_signup",
      { p_nombre: values.organizacion },
    );

    if (orgError || !organizationId) {
      setLoading(false);
      toast.error("No se pudo crear la organización", { description: orgError?.message });
      return;
    }

    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email: values.email,
      password: values.password,
      options: {
        data: {
          nombre: values.nombre,
          organization_id: organizationId,
          rol: "ADMIN",
        },
      },
    });

    setLoading(false);

    if (signUpError) {
      toast.error("No se pudo crear la cuenta", { description: signUpError.message });
      return;
    }

    if (signUpData.session) {
      router.push("/dashboard");
      router.refresh();
      return;
    }

    toast.success("Cuenta creada", {
      description: "Revisa tu correo para confirmar tu cuenta antes de iniciar sesión.",
    });
    router.push("/login");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Crear cuenta</CardTitle>
        <CardDescription>Registra tu empresa en LicitaAI</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="organizacion">Empresa</Label>
            <Input id="organizacion" autoComplete="organization" {...register("organizacion")} />
            {errors.organizacion && (
              <p className="text-sm text-destructive">{errors.organizacion.message}</p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="nombre">Nombre completo</Label>
            <Input id="nombre" autoComplete="name" {...register("nombre")} />
            {errors.nombre && (
              <p className="text-sm text-destructive">{errors.nombre.message}</p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">Correo electrónico</Label>
            <Input id="email" type="email" autoComplete="email" {...register("email")} />
            {errors.email && (
              <p className="text-sm text-destructive">{errors.email.message}</p>
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
            {loading ? "Creando cuenta…" : "Crear cuenta"}
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          ¿Ya tienes cuenta?{" "}
          <Link href="/login" className="font-medium text-foreground underline">
            Inicia sesión
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
