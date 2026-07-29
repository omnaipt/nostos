import * as React from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Camera, FileText, Loader2, Wine } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  useParseMenu,
  useReviewImports,
  type ParseMenuFile,
} from "@/hooks/use-menu-import";

// Entrada do onboarding da ementa: fotos (até 8) ou 1 PDF → a edge parse-menu
// lê e faz staging em menu_imports → o dono revê em /ementa/rever/:id e SÓ
// "Publicar ementa" escreve no menu real. A carta de vinhos importa-se em
// passo separado (mode wine_list, convenção "Região · castas · perfil").

const MAX_PHOTOS = 8;
const MAX_FILE_MB = 8;

const MEDIA_KIND: Record<string, "image" | "pdf"> = {
  "image/jpeg": "image",
  "image/png": "image",
  "image/webp": "image",
  "application/pdf": "pdf",
};

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(new Error("Não foi possível ler o ficheiro."));
    reader.readAsDataURL(file);
  });
}

export function ImportMenuCard({ restaurantId }: { restaurantId: string }) {
  const navigate = useNavigate();
  const parse = useParseMenu(restaurantId);
  const importsQuery = useReviewImports(restaurantId);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const modeRef = React.useRef<"menu" | "wine_list">("menu");

  function pick(mode: "menu" | "wine_list") {
    modeRef.current = mode;
    inputRef.current?.click();
  }

  async function onFiles(list: FileList | null) {
    const files = [...(list ?? [])];
    if (files.length === 0) return;
    const bad = files.find((f) => !MEDIA_KIND[f.type]);
    if (bad) {
      toast.error(`"${bad.name}": usa fotos (JPG/PNG/WebP) ou um PDF.`);
      return;
    }
    const tooBig = files.find((f) => f.size > MAX_FILE_MB * 1024 * 1024);
    if (tooBig) {
      toast.error(`"${tooBig.name}" passa os ${MAX_FILE_MB} MB.`);
      return;
    }
    const pdfs = files.filter((f) => f.type === "application/pdf");
    if (pdfs.length > 1 || (pdfs.length === 1 && files.length > 1)) {
      toast.error("Ou 1 PDF ou fotos — não misturar.");
      return;
    }
    if (pdfs.length === 0 && files.length > MAX_PHOTOS) {
      toast.error(`Máximo ${MAX_PHOTOS} fotos por importação.`);
      return;
    }
    const mode = modeRef.current;
    let payload: ParseMenuFile[];
    try {
      payload = await Promise.all(
        files.map(async (f) => ({
          kind: MEDIA_KIND[f.type],
          mediaType: f.type,
          dataBase64: await toBase64(f),
        })),
      );
    } catch {
      toast.error("Não foi possível ler os ficheiros. Tenta novamente.");
      return;
    }
    parse.mutate(
      { files: payload, mode, sourceRef: files.map((f) => f.name).join(", ").slice(0, 200) },
      {
        onSuccess: (result) => {
          if (!result.parsed || !result.import_id) {
            // Estado honesto (aceitação 4): motivo claro + fallback manual.
            toast.error(
              result.reason
                ? `Não conseguimos ler: ${result.reason}. Tenta fotos mais nítidas ou adiciona os pratos à mão em baixo.`
                : "Não conseguimos ler o menu. Tenta fotos mais nítidas ou adiciona os pratos à mão em baixo.",
            );
            return;
          }
          toast.success(
            mode === "wine_list" ? "Carta de vinhos lida. Revê antes de publicar." : "Menu lido. Revê antes de publicar.",
          );
          navigate(`/ementa/rever/${result.import_id}`);
        },
        onError: (e) =>
          toast.error(e instanceof Error ? e.message : "Falha ao contactar a leitura por IA."),
      },
    );
  }

  const pending = importsQuery.data ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Importar por foto ou PDF</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {parse.isPending ? (
          <div className="flex items-center gap-3 rounded-md border border-dashed border-input p-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            A ler o menu… pode demorar um minuto. Nada é publicado sem a tua revisão.
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Tira fotos ao menu em papel (até {MAX_PHOTOS}) ou carrega o PDF. A IA lê,
              tu reves, e só depois publica. A carta de vinhos entra à parte.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => pick("menu")}>
                <Camera className="h-4 w-4" /> Fotos ou PDF do menu
              </Button>
              <Button size="sm" variant="ghost" onClick={() => pick("wine_list")}>
                <Wine className="h-4 w-4" /> Carta de vinhos
              </Button>
            </div>
          </>
        )}

        {pending.length > 0 && (
          <ul className="divide-y divide-border rounded-md border border-[hsl(var(--status-pending-fg))]/40 bg-[hsl(var(--status-pending-bg))]">
            {pending.map((imp) => (
              <li key={imp.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="min-w-0 text-sm">
                  <span className="font-medium">
                    {imp.source_kind === "wine_list" ? "Carta de vinhos" : "Menu"} por rever
                  </span>
                  <span className="text-muted-foreground">
                    {" "}
                    · {imp.items_count} it{imp.items_count === 1 ? "em" : "ens"}
                    {imp.flagged_count > 0 && ` · ${imp.flagged_count} sinalizado${imp.flagged_count > 1 ? "s" : ""}`}
                    {imp.source_ref && (
                      <span className="hidden sm:inline"> · {imp.source_ref}</span>
                    )}
                  </span>
                </span>
                <Link
                  to={`/ementa/rever/${imp.id}`}
                  className={buttonVariants({ size: "sm", variant: "outline" }) + " shrink-0"}
                >
                  <FileText className="h-4 w-4" /> Rever
                </Link>
              </li>
            ))}
          </ul>
        )}

        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp,application/pdf"
          className="hidden"
          onChange={(e) => {
            onFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </CardContent>
    </Card>
  );
}
