import * as React from "react";
import { toast } from "sonner";
import { Loader2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useChangeMemberRole,
  useInviteMember,
  useRemoveMember,
  useTeam,
} from "@/hooks/use-team";
import { MEMBER_ROLES, ROLE_HINT, ROLE_LABEL, type MemberRole } from "@/lib/roles";

// Cartão Equipa (spec §1) — owner-only, junto à Identidade da casa. Convidar
// por email + role, mudar role, remover. O último owner é protegido na UI
// (desabilita despromover/remover) e também no servidor (trigger do Marco).

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : "Não foi possível guardar. Tenta novamente.";
}

export function EquipaCard({ restaurantId }: { restaurantId: string }) {
  const teamQuery = useTeam(restaurantId);
  const invite = useInviteMember(restaurantId);
  const changeRole = useChangeMemberRole(restaurantId);
  const remove = useRemoveMember(restaurantId);

  const [email, setEmail] = React.useState("");
  const [inviteRole, setInviteRole] = React.useState<MemberRole>("balcao");

  const members = teamQuery.data ?? [];
  const ownerCount = members.filter((m) => m.role === "owner" && !m.pending).length;

  function onInvite(e: React.FormEvent) {
    e.preventDefault();
    const addr = email.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(addr)) {
      toast.error("Indica um email válido.");
      return;
    }
    invite.mutate(
      { email: addr, role: inviteRole },
      {
        onSuccess: () => {
          toast.success(`Convite enviado para ${addr}.`);
          setEmail("");
        },
        onError: (err) => toast.error(errMsg(err)),
      },
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Equipa</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Dá acesso à tua gente por perfil. Cada perfil vê só a sua área.
        </p>

        {teamQuery.isLoading && (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        )}

        {teamQuery.isError && (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            Não foi possível carregar a equipa.
          </p>
        )}

        {!teamQuery.isLoading && !teamQuery.isError && (
          <ul className="divide-y divide-border rounded-md border border-input">
            {members.map((m) => {
              const isLastOwner = m.role === "owner" && ownerCount <= 1;
              return (
                <li key={m.userId} className="flex flex-wrap items-center gap-2 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {m.name ?? m.email ?? "Membro da equipa"}
                      {m.isSelf && <span className="ml-2 text-xs font-normal text-muted-foreground">(tu)</span>}
                      {m.pending && (
                        <span className="ml-2 rounded-full border border-[hsl(var(--status-pending-fg))]/40 bg-[hsl(var(--status-pending-bg))] px-2 py-0.5 text-[11px] font-normal text-[hsl(var(--status-pending-fg))]">
                          convite pendente
                        </span>
                      )}
                    </p>
                    {m.email && m.name && (
                      <p className="truncate text-xs text-muted-foreground">{m.email}</p>
                    )}
                  </div>
                  <Select
                    aria-label={`Perfil de ${m.name ?? m.email ?? "membro"}`}
                    className="h-9 w-32 py-0 text-sm"
                    value={m.role}
                    disabled={m.pending || isLastOwner || changeRole.isPending}
                    title={isLastOwner ? "Tem de existir sempre um dono." : undefined}
                    onChange={(e) =>
                      changeRole.mutate(
                        { userId: m.userId, role: e.target.value as MemberRole },
                        {
                          onSuccess: () => toast.success("Perfil actualizado."),
                          onError: (err) => toast.error(errMsg(err)),
                        },
                      )
                    }
                  >
                    {MEMBER_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABEL[r]}
                      </option>
                    ))}
                  </Select>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-9 text-muted-foreground"
                    disabled={isLastOwner || remove.isPending}
                    title={isLastOwner ? "Tem de existir sempre um dono." : undefined}
                    onClick={() => {
                      if (!window.confirm(`Remover ${m.name ?? m.email ?? "este membro"} da equipa?`)) return;
                      remove.mutate(m.userId, {
                        onSuccess: () => toast.success("Membro removido."),
                        onError: (err) => toast.error(errMsg(err)),
                      });
                    }}
                  >
                    Remover
                  </Button>
                </li>
              );
            })}
          </ul>
        )}

        {/* Convidar */}
        <form onSubmit={onInvite} className="space-y-2 rounded-md border border-input bg-muted/20 p-3">
          <p className="text-sm font-medium">Convidar</p>
          <div className="flex flex-wrap gap-2">
            <Input
              type="email"
              aria-label="Email do convidado"
              placeholder="email@exemplo.pt"
              className="min-w-48 flex-1"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Select
              aria-label="Perfil do convidado"
              className="w-32"
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as MemberRole)}
            >
              {MEMBER_ROLES.filter((r) => r !== "owner").map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </Select>
            <Button type="submit" disabled={invite.isPending}>
              {invite.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
              Convidar
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">{ROLE_HINT[inviteRole]}</p>
        </form>
      </CardContent>
    </Card>
  );
}
