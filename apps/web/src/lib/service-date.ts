// CONTRATO service_date (FROZEN) — fonte de verdade para o dia de serviço.
//
// A APP é responsável por calcular service_date a partir da data escolhida no
// form, NO FUSO DO RESTAURANTE (restaurants.timezone, ex.: "Europe/Lisbon").
// O default UTC do schema (reservations.service_date default now() at UTC) é
// APENAS fallback; perto da meia-noite a data UTC diverge da data local e está
// ERRADA para o produto. Por isso a escrita NUNCA depende desse default:
// computeServiceDate() devolve sempre o valor explícito a gravar.
//
// WIRING #4 (Marco): o contrato está ENFORCED em useSaveReservation()
// (hooks/use-reservations.ts), que chama computeServiceDate(date, timezone, time)
// e computeReservedAt(date, time, turnStart, timezone) e envia service_date +
// reserved_at explícitos no insert/update.
//
// ANCORAGEM NO FUSO DO RESTAURANTE (correcção #17): a hora civil escolhida pelo
// staff (formDate + time) é interpretada SEMPRE no fuso do restaurante, NUNCA no
// fuso do browser. `new Date("yyyy-MM-ddTHH:mm")` é ingénuo: o motor JS interpreta
// essa string no fuso LOCAL do browser. Se o browser do staff estiver noutro fuso
// que o restaurante (suporte remoto, VPN, viagem, conta multi-restaurante), o
// instante e a data civil derrapavam. zonedWallTimeToUtc() resolve o instante UTC
// exacto que corresponde àquela hora de parede no fuso do restaurante.

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
 * Offset (em minutos) do `timeZone` para um dado instante UTC, no sentido
 * "tempo local = UTC + offset". Ex.: Europe/Lisbon em Julho (WEST) => +60.
 *
 * Usa Intl.DateTimeFormat com timeZone para ler as componentes de parede desse
 * instante no fuso pedido, e compara com as componentes UTC. Zero dependências —
 * o motor JS traz a base de dados de fusos (IANA), incluindo DST por data.
 */
function tzOffsetMinutes(instant: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  // Componentes de parede no fuso alvo, reinterpretadas como se fossem UTC.
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return Math.round((asUtc - instant.getTime()) / 60000);
}

/**
 * Converte uma hora de parede (componentes civis) no `timeZone` para o instante
 * UTC correspondente. Resolve o offset na própria data (lida com DST) por
 * aproximação em dois passos: primeiro assume offset 0, depois corrige com o
 * offset real desse instante. O segundo passo cobre os saltos DST porque
 * reavalia o offset no instante candidato.
 */
function zonedWallTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  const wallAsUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
  const firstGuess = new Date(wallAsUtc);
  const offset1 = tzOffsetMinutes(firstGuess, timeZone);
  const candidate = new Date(wallAsUtc - offset1 * 60000);
  // Reavalia o offset no instante candidato (corrige fronteiras DST).
  const offset2 = tzOffsetMinutes(candidate, timeZone);
  if (offset2 === offset1) return candidate;
  return new Date(wallAsUtc - offset2 * 60000);
}

/** Parse defensivo de "HH:mm" (aceita "HH:mm:ss"). Devolve null se inválido. */
function parseTime(time: string): { hour: number; minute: number } | null {
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(time);
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (hour > 23 || minute > 59) return null;
  return { hour, minute };
}

/** Parse defensivo de "yyyy-MM-dd". Devolve null se inválido. */
function parseIsoDate(date: string): { year: number; month: number; day: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return null;
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

/**
 * service_date a gravar (yyyy-MM-dd), derivada NO FUSO DO RESTAURANTE.
 *
 * O staff escolhe `formDate` (yyyy-MM-dd) e opcionalmente `time` (HH:mm). Para
 * obedecer ao contrato FROZEN, ancoramos a hora de parede (formDate+time) no
 * fuso do restaurante, obtemos o instante UTC exacto, e lemos o dia de calendário
 * NESSE fuso. Sem `time` ou `timezone`, a data escolhida É já o dia de serviço
 * (não há instante a converter), pelo que devolvemos formDate directamente.
 *
 * Devolve SEMPRE um valor explícito — nunca se confia no default UTC do schema.
 */
export function computeServiceDate(
  formDate: string,
  timezone?: string,
  time?: string,
): string {
  if (!timezone || !time) return formDate;
  const d = parseIsoDate(formDate);
  const t = parseTime(time);
  if (!d || !t) return formDate;
  const instant = zonedWallTimeToUtc(d.year, d.month, d.day, t.hour, t.minute, timezone);
  if (Number.isNaN(instant.getTime())) return formDate;
  try {
    // en-CA => "yyyy-MM-dd". Formata o instante UTC no fuso do restaurante.
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    return fmt.format(instant);
  } catch {
    return formDate;
  }
}

/**
 * reserved_at (timestamptz NOT NULL no schema) a gravar — instante UTC exacto.
 * Ancora a hora de parede (formDate + time | turnStartTime | "12:00") no fuso do
 * restaurante e devolve o instante UTC em ISO 8601. Sem `timezone` cai no
 * comportamento anterior (interpretação no fuso do browser) apenas como fallback
 * defensivo; o caller passa sempre o timezone do restaurante.
 */
export function computeReservedAt(
  formDate: string,
  time?: string,
  turnStartTime?: string,
  timezone?: string,
): string {
  const hhmm = time || turnStartTime || "12:00";
  const d = parseIsoDate(formDate);
  const t = parseTime(hhmm);
  if (d && t && timezone) {
    const instant = zonedWallTimeToUtc(d.year, d.month, d.day, t.hour, t.minute, timezone);
    if (!Number.isNaN(instant.getTime())) return instant.toISOString();
  }
  // Fallback sem timezone: instante interpretado no fuso do browser.
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
