import { Landmark } from "lucide-react";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted/40 p-6">
      <div className="flex items-center gap-2.5">
        <span className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Landmark className="size-5" />
        </span>
        <span className="text-xl font-semibold tracking-tight">LicitaAI</span>
      </div>
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
