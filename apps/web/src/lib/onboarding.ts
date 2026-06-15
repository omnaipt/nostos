import { supabase } from "@/integrations/supabase/client";
import type { OnboardingValues } from "@/lib/schemas";
import type { Restaurant } from "@/lib/types";

// C3 — criação atómica-na-prática do tenant no onboarding:
//   1. signUp (auth) com email+password → cria o utilizador e a sessão.
//   2. insert restaurants (owner_id = user) — assignment_mode fica no default
//      'manual' do schema (NÃO enviado); timezone gravado explicitamente.
//   3. insert restaurant_members (owner) — necessário para as RLS passarem a
//      reconhecer o user como membro nas escritas seguintes.
//   4. insert tables[] e turns[].
//
// Tudo passa pelas policies RLS (tenant-scoped): o insert de restaurants exige
// owner_id = auth.uid(); o de members exige ser owner; tables/turns exigem
// membership. Não há filtragem de tenant no cliente.

export interface OnboardingInput extends OnboardingValues {
  password: string;
}

export async function runOnboarding(input: OnboardingInput): Promise<Restaurant> {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Lisbon";

  // 1. Auth: cria conta + sessão.
  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email: input.email,
    password: input.password,
    options: { data: { full_name: input.name } },
  });
  if (signUpError) throw signUpError;
  const userId = signUpData.user?.id;
  if (!userId) {
    throw new Error(
      "Conta criada mas falta confirmação de email. Confirma o email e entra para terminar a configuração.",
    );
  }
  // Sem sessão activa (confirmação de email ligada) não conseguimos escrever
  // sob RLS. Em F1 a confirmação está desligada no projeto dev.
  if (!signUpData.session) {
    throw new Error(
      "É preciso confirmar o email antes de criar o restaurante. Verifica a tua caixa de entrada.",
    );
  }

  // 2. Restaurante (owner = user). assignment_mode omitido → default 'manual'.
  const { data: restaurant, error: restError } = await supabase
    .from("restaurants")
    .insert({
      name: input.name,
      email: input.email,
      phone: input.phone,
      timezone,
      owner_id: userId,
    })
    .select("*")
    .single();
  if (restError) throw restError;

  // 3. Membership owner (habilita RLS para os inserts seguintes).
  const { error: memberError } = await supabase.from("restaurant_members").insert({
    restaurant_id: restaurant.id,
    user_id: userId,
    role: "owner",
  });
  if (memberError) throw memberError;

  // 4. Mesas.
  const { error: tablesError } = await supabase.from("tables").insert(
    input.tables.map((t, i) => ({
      restaurant_id: restaurant.id,
      label: t.label,
      seats: t.seats,
      sort_order: t.sortOrder ?? i + 1,
      active: t.active,
    })),
  );
  if (tablesError) throw tablesError;

  // 5. Turnos. service vazio → null (texto livre opcional).
  const { error: turnsError } = await supabase.from("turns").insert(
    input.turns.map((t) => ({
      restaurant_id: restaurant.id,
      label: t.label,
      service: t.service ? t.service : null,
      start_time: t.startTime,
      weekdays: t.weekdays,
      active: t.active,
    })),
  );
  if (turnsError) throw turnsError;

  return restaurant as Restaurant;
}
