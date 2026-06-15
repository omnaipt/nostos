// CONTRATO service_date (FROZEN) — fonte de verdade para o dia de serviço.
//
// A APP é responsável por calcular service_date a partir da data escolhida no
// form, NO FUSO DO RESTAURANTE (restaurants.timezone, ex.: "Europe/Lisbon").
// O default UTC do schema (reservations.service_date default now() at UTC) é
// APENAS fallback; perto da meia-noite a data UTC diverge da data local e está
// ERRADA para o produto. Por isso a escrita NUNCA depende desse default:
// computeServiceDate() devolve sempre o valor explícito a gravar.
//
// WIRING #4 (Marco): o contrato está ENFORCED em buildReservationWrite()
// (lib/reservations.ts), que chama computeServiceDate(date, timezone) e envia
// service_date + reserved_at explícitos no insert/update.

/**
 * Data local de hoje no formato yyyy-MM-dd (fuso do browser).
 * Usada como default e como limite mínimo de reserva (walk-in só para hoje+).
 * Nota: o limite "hoje" da UI usa o fuso do browser; o service_date gravado
 * usa o fuso do restaurante (computeServiceDate). Em F1 os clientes-alvo são
 * PT (Europe/Lisbon ≈ browser), pelo que a divergência prática é nula.
 */
export function todayServiceDate(): string {
  const d = new Date();
  return toIsoDate(d);
}

export function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

/**
 * service_date a gravar (yyyy-MM-dd), derivada NO FUSO DO RESTAURANTE.
 *
 * O staff escolhe `formDate` (yyyy-MM-dd) e opcionalmente `time` (HH:mm). Para
 * obedecer ao contrato FROZEN, combinamos data+hora, interpretamos esse
 * instante e lemos o dia de calendário NESSE fuso (Intl.DateTimeFormat com
 * timeZone). Sem `time`, a data escolhida é já o dia de serviço (não há
 * instante a converter), pelo que devolvemos formDate directamente.
 *
 * Devolve SEMPRE um valor explícito — nunca se confia no default UTC do schema.
 */
export function computeServiceDate(
  formDate: string,
  timezone?: string,
  time?: string,
): string {
  if (!timezone || !time) return formDate;
  // Instante local "ingénuo" (sem fuso). Convertemo-lo para o dia de calendário
  // tal como visto no fuso do restaurante.
  const naive = new Date(`${formDate}T${time}:00`);
  if (Number.isNaN(naive.getTime())) return formDate;
  try {
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    // en-CA => "yyyy-MM-dd".
    return fmt.format(naive);
  } catch {
    return formDate;
  }
}

/**
 * reserved_at (timestamptz NOT NULL no schema) a gravar.
 * Combina a data de serviço com a hora exacta (se houver) ou, em fallback, o
 * start_time do turno; sem nenhum, usa meio-dia local da data (timestamp
 * estável e dentro do dia). Devolve ISO 8601.
 */
export function computeReservedAt(
  formDate: string,
  time?: string,
  turnStartTime?: string,
): string {
  const hhmm = time || turnStartTime || "12:00";
  const dt = new Date(`${formDate}T${hhmm}:00`);
  if (Number.isNaN(dt.getTime())) return new Date(`${formDate}T12:00:00`).toISOString();
  return dt.toISOString();
}

/** true se a data (yyyy-MM-dd) é anterior a hoje => reserva bloqueada. */
export function isPastDate(isoDate: string): boolean {
  return isoDate < todayServiceDate();
}

/** Navega N dias a partir de uma data yyyy-MM-dd e devolve yyyy-MM-dd. */
export function shiftIsoDate(isoDate: string, deltaDays: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + deltaDays);
  return toIsoDate(dt);
}
