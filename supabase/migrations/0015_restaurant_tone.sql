-- 0015 — Tom por restaurante (spec Reserva Proximidade §6b, David 29-07).
-- A voz da casa não é uma só: a marisqueira familiar fala "próximo", o
-- fine-dining fala "formal". Dois registos chegam no v1; uma escala de 5
-- seria falsa precisão. Aplica-se onde a casa fala: página /r, mensagens de
-- confirmação (edge send-reservation-message) e sommelier.

alter table public.restaurants
  add column if not exists tone text not null default 'proximo'
  constraint restaurants_tone_check check (tone in ('proximo', 'formal'));
