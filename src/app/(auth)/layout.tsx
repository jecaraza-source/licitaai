import Image from "next/image";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted/40 p-6">
      <Image
        src="/branding/tci-logo-full.png"
        alt="TCI"
        width={1182}
        height={550}
        priority
        className="h-16 w-auto"
      />
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
