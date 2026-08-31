import Image from "next/image";
import { Building2 } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { UserMenu } from "@/components/layout/user-menu";

export function Header({
  nombre,
  email,
  empresaNombre,
}: {
  nombre: string;
  email: string;
  empresaNombre?: string | null;
}) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
      <SidebarTrigger className="-ml-1" />
      <Image
        src="/branding/licitaai-dashboard-horizontal.png"
        alt="LicitaAI"
        width={220}
        height={90}
        priority
        className="ml-1 h-9 w-auto max-w-[9rem] object-contain object-left md:hidden"
      />
      <Separator orientation="vertical" className="mr-2 h-4" />
      {empresaNombre && (
        <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Building2 className="size-3.5" />
          {empresaNombre}
        </span>
      )}
      <div className="flex-1" />
      <UserMenu nombre={nombre} email={email} />
    </header>
  );
}
