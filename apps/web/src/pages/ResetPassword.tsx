import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// G3 — definir nova palavra-passe. O link de recuperação do email cria uma
// sessão (detectSessionInUrl); sem sessão, o link é inválido/expirado.
export default function ResetPassword() {
  const navigate = useNavigate();
  const { session, loading: authLoading } = useAuth();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(undefined);
    if (password.length < 8) {
      setError("A palavra-passe tem de ter pelo menos 8 caracteres.");
      return;
    }
    if (password !== confirm) {
      setError("As palavras-passe não coincidem.");
      return;
    }
    setSaving(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (err) {
      setError("Não foi possível alterar a palavra-passe. Pede um novo link e tenta outra vez.");
      return;
    }
    toast.success("Palavra-passe alterada");
    navigate("/");
  };

  return (
    <div className="grid min-h-screen place-items-center bg-muted/30 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Nova palavra-passe</CardTitle>
        </CardHeader>
        <CardContent>
          {authLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
            </div>
          ) : !session ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Este link é inválido ou expirou. Pede um novo link de recuperação.
              </p>
              <Link to="/recuperar-password" className="text-sm font-medium underline">
                Pedir novo link
              </Link>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="pw">Nova palavra-passe</Label>
                <Input id="pw" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pw2">Repetir palavra-passe</Label>
                <Input id="pw2" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={8} />
              </div>
              {error && (
                <p role="alert" className="text-xs font-medium text-destructive">{error}</p>
              )}
              <Button type="submit" className="w-full" disabled={saving}>
                {saving ? "A guardar..." : "Guardar nova palavra-passe"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
