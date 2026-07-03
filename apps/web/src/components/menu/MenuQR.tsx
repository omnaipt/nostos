import { useRef } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Download, Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

// QR do menu público. Renderiza um SVG (nítido a qualquer tamanho de
// impressão) e permite descarregar o SVG e copiar o link. O URL deriva do
// slug do restaurante e do domínio actual (nostos.pt em produção).

export function MenuQR({ slug }: { slug: string }) {
  const url = `${window.location.origin}/m/${slug}`;
  const ref = useRef<HTMLDivElement>(null);

  function downloadSvg() {
    const svg = ref.current?.querySelector("svg");
    if (!svg) return;
    const src = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([src], { type: "image/svg+xml;charset=utf-8" });
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = `menu-${slug}.svg`;
    a.click();
    URL.revokeObjectURL(href);
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copiado");
    } catch {
      toast.error("Não foi possível copiar o link.");
    }
  }

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:gap-6">
      <div ref={ref} className="rounded-md bg-white p-3">
        <QRCodeSVG value={url} size={144} level="M" />
      </div>
      <div className="space-y-2 text-center sm:text-left">
        <p className="text-sm text-muted-foreground">
          Imprime este código e põe-no nas mesas. Aponta para o teu menu público:
        </p>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="block break-all text-sm font-medium text-primary underline"
        >
          {url}
        </a>
        <div className="flex justify-center gap-2 sm:justify-start">
          <Button size="sm" variant="outline" onClick={downloadSvg}>
            <Download className="h-4 w-4" /> Descarregar QR
          </Button>
          <Button size="sm" variant="ghost" onClick={copyLink}>
            <Copy className="h-4 w-4" /> Copiar link
          </Button>
        </div>
      </div>
    </div>
  );
}
