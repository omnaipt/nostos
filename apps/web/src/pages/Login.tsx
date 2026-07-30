import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
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
// acesso pelo trigger handle_new_user no primeiro signup com aquele email, mas
// sem um formulário de criar conta não havia como chegar lá. O /onboarding não
// serve: esse cria um restaurante novo, e o convidado quer entrar num existente.
//
// A confirmação de email está desligada no projecto, logo o signUp devolve
// sessão imediata e a pessoa entra directamente (verificado em 30-07).

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
  const [loading, setLoading] = useState(false);

  const entrar = async () => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      toast.error(error.message);
      return;
    }
    navigate("/");
  };

  const criar = async () => {
    if (password.length < 8) {
      toast.error("A palavra-passe tem de ter pelo menos 8 caracteres.");
      return;
    }
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) {
      toast.error(error.message);
      return;
    }
    if (!data.session) {
      toast.success("Conta criada. Confirme o email e depois entre aqui.");
      setMode("entrar");
      return;
    }
    // O trigger já correu; se não houver acesso a nenhum restaurante, o convite
    // não existia para este endereço. Dizemos isso em vez de deixar a pessoa
    // numa app vazia sem perceber porquê.
    const { count } = await supabase
      .from("restaurant_members")
      .select("restaurant_id", { count: "exact", head: true });
    if (!count) {
      toast.error(
        "Conta criada, mas não há convite para este email. Peça a quem o convidou para usar este endereço exacto.",
      );
      return;
    }
    toast.success("Conta criada. Bem-vindo.");
    navigate("/");
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "criar") await criar();
      else await entrar();
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
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Palavra-passe</Label>
              <Input
                id="password"
                type="password"
                autoComplete={mode === "criar" ? "new-password" : "current-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              {mode === "criar" && (
                <p className="text-xs text-muted-foreground">Mínimo 8 caracteres.</p>
              )}
            </div>
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
              onClick={() => setMode(mode === "criar" ? "entrar" : "criar")}
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
