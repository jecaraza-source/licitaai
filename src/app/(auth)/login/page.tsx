"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { toast } from "sonner";
import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail } from "lucide-react";
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
  const [showPassword, setShowPassword] = useState(false);
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
    <Card className="overflow-hidden border-border/70 bg-card shadow-xl shadow-primary/5">
      <CardHeader className="gap-3 px-7 pb-5 pt-8 sm:px-9 sm:pt-9">
        <div className="flex size-10 items-center justify-center rounded-xl bg-secondary text-primary">
          <LockKeyhole className="size-5" aria-hidden="true" />
        </div>
        <div className="space-y-1">
          <CardTitle as="h1" className="text-2xl tracking-tight">Bienvenido de nuevo</CardTitle>
          <CardDescription className="text-sm leading-6">
            Continúa gestionando tus oportunidades públicas.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="px-7 pb-8 sm:px-9">
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">Correo electrónico</Label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input id="email" type="email" autoComplete="email" autoFocus className="h-11 pl-10" placeholder="nombre@empresa.com" {...register("email")} />
            </div>
            {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="password">Contraseña</Label>
            <div className="relative">
              <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input id="password" type={showPassword ? "text" : "password"} autoComplete="current-password" className="h-11 px-10" {...register("password")} />
              <button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute right-2 top-1/2 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}>
                {showPassword ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
              </button>
            </div>
            {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
          </div>
          <Button type="submit" disabled={loading} className="h-11 w-full gap-2">
            {loading ? "Entrando…" : "Iniciar sesión"}
            {!loading && <ArrowRight className="size-4" aria-hidden="true" />}
          </Button>
        </form>
        <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground"><span className="h-px flex-1 bg-border" />Acceso seguro<span className="h-px flex-1 bg-border" /></div>
        <p className="text-center text-sm text-muted-foreground">¿No tienes cuenta?{" "}<Link href="/register" className="font-semibold text-primary hover:underline">Crear cuenta</Link></p>
      </CardContent>
    </Card>
  );
}
