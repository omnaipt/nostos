-- 0002 — FIX P0 onboarding: o RETURNING do insert de restaurants falhava sob
-- RLS porque restaurants_member_select só permite membros e a membership
-- (restaurant_members) só é criada DEPOIS do insert do restaurante.
-- Correcção: o owner vê sempre o seu próprio restaurante. Isolamento entre
-- tenants mantém-se (owner_id = auth.uid() é tão restritivo como membership).
drop policy if exists restaurants_member_select on public.restaurants;
create policy restaurants_member_select on public.restaurants
  for select using (public.is_restaurant_member(id) or owner_id = auth.uid());
