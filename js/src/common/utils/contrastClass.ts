/**
 * Devolve a classe de contraste do core (`text-contrast--light` / `--dark`)
 * para uma cor de fundo, ou string vazia quando não há cor utilizável.
 *
 * Por que não importar `flarum/common/helpers/textContrastClass`: o core o
 * registra com `addChunkModule`, ou seja, ele vive num chunk sob demanda. Antes
 * do chunk carregar, `flarum.reg.get` devolve `undefined` — e, por ser chunk,
 * o registry nem emite warning (`ExportRegistry.get` pula as duas ramificações
 * de aviso quando `isInChunk`). Chamar o helper no caminho de render viraria
 * `undefined(cor)` e derrubaria a página inteira.
 *
 * As CLASSES continuam sendo as do core: moram no stylesheet principal
 * (scaffolding.less), não num chunk, então sempre existem. O que replicamos
 * aqui é só a decisão — a fórmula YIQ do W3C (AERT), lendo o mesmo
 * `--yiq-threshold` que o core lê, para um tema que ajuste o limiar continuar
 * concordando conosco.
 *
 * Só entende hex, igual ao `isDark` do core: qualquer outro formato cai em
 * "tratar como claro", que é exatamente o comportamento dele.
 */
export default function contrastClass(color: string | null | undefined): string {
  if (!color || color.length < 4) return '';

  let hex = color.replace('#', '');
  if (hex.length === 3) {
    hex = hex
      .split('')
      .map((c) => c.repeat(2))
      .join('');
  }

  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;

  const threshold = parseInt(getComputedStyle(document.body).getPropertyValue('--yiq-threshold').trim()) || 128;

  return yiq < threshold ? 'text-contrast--light' : 'text-contrast--dark';
}

/**
 * Lê um custom property do `:root` em runtime, com fallback.
 *
 * Serve para valores DEFAULT de formulário (ex.: o seletor de cor de destaque
 * de um título novo), onde cravar um hex significa oferecer o verde do Flarum
 * padrão a um fórum cujo tema é laranja.
 */
export function cssVar(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}
