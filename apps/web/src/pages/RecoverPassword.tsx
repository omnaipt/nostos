import { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// G3 — pedir email de recuperação. Resposta neutra quer o email exista quer
// não (não revelar contas). O link do email abre /repor-password.
export default function RecoverPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string>();

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(undefined);
    const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/repor-password`,
    });
    setLoading(false);
    // Rate limit ou erro de rede: mostramos erro; email inexistente NÃO é erro.
    if (err && !/user not found/i.test(err.message)) {
      setError("Não foi possível enviar o email. Tenta novamente dentro de um minuto.");
      return;
    }
    setSent(true);
  };

  return (
    <div className="grid min-h-screen place-items-center bg-muted/30 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Recuperar palavra-passe</CardTitle>
        </CardHeader>
        <CardContent>
          {sent ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Se existir uma conta com esse email, vais receber uma mensagem com o link
                para definir uma nova palavra-passe. Verifica também o spam.
              </p>
              <Link to="/login" className="text-sm font-medium underline">
                Voltar ao login
              </Link>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email da conta</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              {error && (
                <p role="alert" className="text-xs font-medium text-destructive">{error}</p>
              )}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "A enviar..." : "Enviar link de recuperação"}
              </Button>
              <Link to="/login" className="block text-center text-sm text-muted-foreground underline">
                Voltar ao login
              </Link>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
