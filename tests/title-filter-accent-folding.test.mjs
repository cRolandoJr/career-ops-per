// tests/title-filter-accent-folding.test.mjs — el filtro de títulos debe ignorar
// tildes en AMBOS lados de la comparación.
//
// Falla real que lo motivó (2026-09-11): YPF publica sus avisos en MAYÚSCULAS SIN
// TILDES ("INGENIERO PROCESOS", "TECNICO CONTROL DE PRODUCCION"). Con un filtro que
// solo hacía toLowerCase(), la palabra "Producción" del portals.yml no matcheaba
// "PRODUCCION" y el scan descartó 37 vacantes reales en una sola corrida — entre
// ellas el puesto más alineado del barrido. El síntoma es silencioso: cuentan como
// filtered_title, no como error.
import { pass, fail, ROOT } from './helpers.mjs';
import { join } from 'path';
import { pathToFileURL } from 'url';

console.log('\nscan.mjs — buildTitleFilter() ignora tildes en titulo y en palabra clave');
try {
  const { buildTitleFilter, matchedTitleKeywords } =
    await import(pathToFileURL(join(ROOT, 'scan.mjs')).href);

  // 1. Palabra con tilde contra titulo sin tilde (el caso de YPF).
  const f1 = buildTitleFilter({ positive: ['Producción'] });
  if (!f1('TECNICO CONTROL DE PRODUCCION')) fail('clave con tilde no matchea titulo sin tilde');

  // 2. El caso inverso: clave sin tilde contra titulo con tilde.
  const f2 = buildTitleFilter({ positive: ['Produccion'] });
  if (!f2('Jefe de Producción')) fail('clave sin tilde no matchea titulo con tilde');

  // 3. Los negativos tambien deben plegar tildes: si no, un negativo se escapa.
  const f3 = buildTitleFilter({ positive: ['Analista'], negative: ['Bioquímic'] });
  if (f3('ANALISTA BIOQUIMICO DE PLANTA')) fail('el negativo con tilde no bloqueo el titulo sin tilde');

  // 4. No romper lo que ya andaba: coincidencia exacta y negativo simple.
  const f4 = buildTitleFilter({ positive: ['Calidad'], negative: ['Software'] });
  if (!f4('Analista de Calidad')) fail('regresion: coincidencia simple dejo de andar');
  if (f4('Software Quality Analyst')) fail('regresion: el negativo dejo de bloquear');

  // 5. La rama de siglas cortas (regex con \b) debe seguir intacta.
  const f5 = buildTitleFilter({ positive: ['it'] });
  if (!f5('IT Communications Network Engineer')) fail('regresion: sigla corta dejo de matchear');
  if (f5('Digital Transformation Lead')) fail('regresion: sigla corta matcheo dentro de una palabra');

  // 6. matchedTitleKeywords() usa la misma comparacion y debe plegar igual.
  const kws = matchedTitleKeywords('TECNICO CONTROL DE PRODUCCION', { positive: ['Producción'] });
  if (!kws.includes('Producción')) fail('matchedTitleKeywords no plego tildes');

  pass('buildTitleFilter() y matchedTitleKeywords() ignoran tildes sin perder precision');
} catch (err) {
  fail(err?.stack || String(err));
}
