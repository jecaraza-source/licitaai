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
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-3 border-b bg-background/85 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/70 md:px-6">
      <SidebarTrigger className="-ml-1" />
      <Image
        src="/branding/licitaai-dashboard-horizontal.png"
        alt="LicitaAI"
        width={220}
        height={90}
        priority
        className="ml-1 h-9 w-auto max-w-[9rem] object-contain object-left md:hidden"
      />
      <Separator orientation="vertical" className="mx-1 h-5" />
      {empresaNombre && (
        <span className="inline-flex max-w-[16rem] items-center gap-2 truncate rounded-full border bg-card py-1 pr-3 pl-2 text-sm font-medium shadow-xs sm:max-w-none">
          <span className="flex size-5 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Building2 className="size-3" />
          </span>
          <span className="truncate">{empresaNombre}</span>
        </span>
      )}
      <div className="flex-1" />
      <UserMenu nombre={nombre} email={email} />
    </header>
  );
}
