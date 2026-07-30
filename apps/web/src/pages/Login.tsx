import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Entrar OU criar conta de convidado.
//
// Porquê o modo "criar conta" (David, 30-07): quem é convidado para a equipa
// recebe o email, chega aqui e não tem palavra-passe nenhuma, porque a conta
// ainda não existe. O convite fica pendente em member_invites e é convertido em
// acesso pelo trigger handle_new_user no primeiro signup com aquele email. O
// /onboarding não serve: esse cria um restaurante novo.
//
// Erros SEMPRE visíveis no formulário, além do toast. Na primeira versão o
// David criou conta e "não aconteceu nada": a conta foi mesmo criada, mas a
// única pista era um toast no canto. Mensagem inline resolve isso.

function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
  hint?: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          className="pr-10"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Esconder palavra-passe" : "Mostrar palavra-passe"}
          className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground hover:text-foreground"
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export default function Login() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // O link do email de convite traz ?convite=1&email=..., para a pessoa cair
  // já no formulário certo e com o endereço preenchido (tem de ser o mesmo
  // endereço do convite, senão o trigger não encontra nada).
  const convite = searchParams.get("convite") === "1";
  const [mode, setMode] = useState<"entrar" | "criar">(convite ? "criar" : "entrar");
  const [email, setEmail] = useState(searchParams.get("email") ?? "");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  function falhar(msg: string) {
    setErro(msg);
    toast.error(msg);
  }

  const entrar = async () => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      falhar(
        /invalid login/i.test(error.message)
          ? "Email ou palavra-passe errados."
          : error.message,
      );
      return;
    }
    navigate("/");
  };

  const criar = async () => {
    if (password.length < 8) {
      falhar("A palavra-passe tem de ter pelo menos 8 caracteres.");
      return;
    }
    if (password !== confirm) {
      falhar("As duas palavras-passe não coincidem.");
      return;
    }

    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) {
      if (/already registered|already exists/i.test(error.message)) {
        falhar("Já existe conta com este email. Entre com a sua palavra-passe.");
        setMode("entrar");
        return;
      }
      falhar(error.message);
      return;
    }
    if (!data.session) {
      toast.success("Conta criada. Confirme o email e depois entre aqui.");
      setMode("entrar");
      return;
    }

    // O trigger já correu. Sem acesso a nenhum restaurante, não havia convite
    // para este endereço: terminamos a sessão para não deixar a pessoa numa app
    // vazia, autenticada e sem perceber o que fazer.
    const { count, error: countErr } = await supabase
      .from("restaurant_members")
      .select("restaurant_id", { count: "exact", head: true });
    if (countErr || !count) {
      await supabase.auth.signOut();
      falhar(
        "Conta criada, mas não há nenhum convite para este email. Peça a quem o convidou para usar exactamente este endereço, e depois entre por aqui.",
      );
      return;
    }
    toast.success("Conta criada. Bem-vindo.");
    navigate("/");
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);
    setLoading(true);
    try {
      if (mode === "criar") await criar();
      else await entrar();
    } catch (err) {
      // Rede em baixo, CORS, qualquer coisa inesperada: sem isto o formulário
      // ficava mudo e parecia que o botão não fazia nada.
      falhar(err instanceof Error ? err.message : "Não foi possível concluir. Tente de novo.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid min-h-screen place-items-center bg-muted/30 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>nostos · {mode === "criar" ? "Criar conta" : "Entrar"}</CardTitle>
        </CardHeader>
        <CardContent>
          {mode === "criar" && (
            <p className="mb-4 text-sm text-muted-foreground">
              Foi convidado para uma equipa? Crie a conta com o mesmo email do
              convite e o acesso fica activo de imediato.
            </p>
          )}
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <PasswordField
              id="password"
              label="Palavra-passe"
              value={password}
              onChange={setPassword}
              autoComplete={mode === "criar" ? "new-password" : "current-password"}
              hint={mode === "criar" ? "Mínimo 8 caracteres." : undefined}
            />

            {mode === "criar" && (
              <PasswordField
                id="confirm"
                label="Repita a palavra-passe"
                value={confirm}
                onChange={setConfirm}
                autoComplete="new-password"
              />
            )}

            {erro && (
              <p
                role="alert"
                className="rounded-md border border-[hsl(var(--destructive)/0.4)] bg-[hsl(var(--destructive)/0.08)] p-3 text-sm text-[hsl(var(--destructive))]"
              >
                {erro}
              </p>
            )}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading
                ? mode === "criar"
                  ? "A criar..."
                  : "A entrar..."
                : mode === "criar"
                  ? "Criar conta"
                  : "Entrar"}
            </Button>

            <button
              type="button"
              onClick={() => {
                setMode(mode === "criar" ? "entrar" : "criar");
                setErro(null);
                setConfirm("");
              }}
              className="block w-full text-center text-sm text-muted-foreground underline"
            >
              {mode === "criar"
                ? "Já tenho conta. Entrar"
                : "Fui convidado e ainda não tenho conta"}
            </button>

            {mode === "entrar" && (
              <Link
                to="/recuperar-password"
                className="block text-center text-sm text-muted-foreground underline"
              >
                Esqueci-me da palavra-passe
              </Link>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
