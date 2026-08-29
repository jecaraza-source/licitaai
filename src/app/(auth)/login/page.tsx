"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { toast } from "sonner";
import { LogIn } from "lucide-react";
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

const loginSchema = z.object({
  email: z.string().email("Correo inválido"),
  password: z.string().min(1, "La contraseña es requerida"),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>({ resolver: zodResolver(loginSchema) });

  async function onSubmit(values: LoginForm) {
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword(values);

    if (error) {
      setLoading(false);
      toast.error("No se pudo iniciar sesión", { description: error.message });
      return;
    }

    await fetch("/api/empresa-perfil/reiniciar", { method: "POST" }).catch(() => {});
    setLoading(false);
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <Card className="border-border/70 bg-card/95 shadow-xl shadow-primary/5">
      <CardHeader className="gap-3 pb-6">
        <div className="flex size-11 items-center justify-center rounded-xl bg-secondary text-primary">
          <LogIn className="size-5" aria-hidden="true" />
        </div>
        <div className="flex flex-col gap-1.5">
          <CardTitle as="h1" className="text-2xl tracking-tight">
            Bienvenido de nuevo
          </CardTitle>
          <CardDescription>Accede a tu cuenta de LicitaAI</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
          <p className="text-sm leading-relaxed text-muted-foreground">
            Gestiona tus oportunidades de contratación con la información siempre a mano.
          </p>
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">Correo electrónico</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              {...register("email")}
            />
            {errors.email && (
              <p className="text-sm text-destructive">{errors.email.message}</p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="password">Contraseña</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              {...register("password")}
            />
            {errors.password && (
              <p className="text-sm text-destructive">{errors.password.message}</p>
            )}
          </div>
          <Button type="submit" disabled={loading} className="mt-2">
            {loading ? "Entrando…" : "Entrar"}
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          ¿No tienes cuenta?{" "}
          <Link href="/register" className="font-medium text-foreground underline">
            Regístrate
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
