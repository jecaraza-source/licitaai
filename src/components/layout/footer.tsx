import Image from "next/image";

export function Footer() {
  return (
    <footer className="mt-auto flex items-center justify-center border-t bg-muted/40 px-4 py-3">
      <Image
        src="/branding/licitaai-dashboard-horizontal.png"
        alt="LicitaAI"
        width={1774}
        height={887}
        unoptimized
        className="h-5 w-auto object-contain opacity-80"
      />
    </footer>
  );
}
