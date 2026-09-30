// Testes do leitor da tabela do BOE. Correr com: node --test scripts/lib/boeHolidays.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseRegionalHolidays, REGION_CODES, validateRegionalHolidays } from './boeHolidays.mjs';

const FIXTURE_2026 = readFileSync(new URL('./fixtures/boe-fiestas-2026.html', import.meta.url), 'utf8');

// Lista conferida à mão contra BOE-A-2025-21667 (ver DOCS/FERIADOS.md).
const EXPECTED_2026 = {
  'ES-AN': ['02-28', '04-02', '11-02', '12-07'],
  'ES-AR': ['04-02', '04-23', '11-02', '12-07'],
  'ES-AS': ['04-02', '09-08', '11-02', '12-07'],
  'ES-IB': ['03-02', '04-02', '04-06', '12-26'],
  'ES-CN': ['04-02', '05-30', '11-02'],
  'ES-CB': ['04-02', '07-28', '09-15', '12-07'],
  'ES-CM': ['04-02', '04-06', '06-04', '11-02'],
  'ES-CL': ['04-02', '04-23', '11-02', '12-07'],
  'ES-CT': ['04-06', '06-24', '09-11', '12-26'],
  'ES-EX': ['04-02', '09-08', '11-02', '12-07'],
  'ES-GA': ['03-19', '04-02', '06-24', '07-25'],
  'ES-MD': ['04-02', '05-02', '11-02', '12-07'],
  'ES-MC': ['03-19', '04-02', '06-09', '12-07'],
  'ES-NC': ['03-19', '04-02', '04-06', '11-02'],
  'ES-PV': ['03-19', '04-02', '04-06', '07-25'],
  'ES-RI': ['04-02', '04-06', '06-09', '12-07'],
  'ES-VC': ['03-19', '04-06', '06-24', '10-09'],
};

test('lê os feriados regionais de 2026 de todas as comunidades', () => {
  const holidays = parseRegionalHolidays(FIXTURE_2026, 2026);
  for (const code of REGION_CODES) {
    const dates = holidays
      .filter((holiday) => holiday.locality === code)
      .map((holiday) => holiday.date.slice(5))
      .sort();
    assert.deepEqual(dates, EXPECTED_2026[code], code);
  }
  assert.equal(holidays.length, 67);
});

test('exclui os nacionais comuns a toda a Espanha (incluindo o 6/1 não substituído)', () => {
  const holidays = parseRegionalHolidays(FIXTURE_2026, 2026);
  for (const national of ['01-01', '01-06', '04-03', '05-01', '08-15', '10-12', '12-08', '12-25']) {
    assert.equal(holidays.filter((holiday) => holiday.date.endsWith(national)).length, 0, national);
  }
});

test('guarda o nome do feriado sem o ponto final do BOE', () => {
  const holidays = parseRegionalHolidays(FIXTURE_2026, 2026);
  const andalucia = holidays.find((holiday) => holiday.locality === 'ES-AN' && holiday.date === '2026-02-28');
  assert.equal(andalucia?.name, 'Día de Andalucía');
});

test('a lista de 2026 passa a validação', () => {
  assert.deepEqual(validateRegionalHolidays(parseRegionalHolidays(FIXTURE_2026, 2026), 2026), []);
});

test('falha alto quando a tabela não tem a forma esperada', () => {
  assert.throws(() => parseRegionalHolidays('<p>sem tabela</p>', 2026), /sem tabela/);
  const withoutGalicia = FIXTURE_2026.replace(/Galicia/g, 'Xxxx');
  assert.throws(() => parseRegionalHolidays(withoutGalicia, 2026), /ES-GA/);
});

test('a validação apanha comunidades com feriados a mais ou a menos', () => {
  const holidays = parseRegionalHolidays(FIXTURE_2026, 2026).filter((holiday) => holiday.locality !== 'ES-MD');
  assert.match(validateRegionalHolidays(holidays, 2026).join('\n'), /ES-MD: 0/);
});
