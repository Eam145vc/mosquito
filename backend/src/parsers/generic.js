// Parser generico - solo intenta extraer un monto si todo el texto
// contiene palabras tipicas de "recibo de pago".
// Util como fallback solo cuando el remitente esta en allowlist pero
// ningun parser especifico lo cubrio.
export const name = 'generic';

export function parse(text) {
  if (!text) return null;
  const looksLikePayment = /(recib|abono|consignaci|transferencia|pago|enviaron|pagaron|depositaron)/i.test(text);
  if (!looksLikePayment) return null;

  // Buscar primer monto con $ seguido por numero
  const m = text.match(/\$\s?([\d.,]+)/);
  if (!m) return null;
  let s = m[1];
  if (s.includes(',') && s.includes('.')) s = s.split(',')[0].replace(/\./g, '');
  else if (s.includes(',')) s = s.split(',')[0];
  else s = s.replace(/\./g, '');
  const amount = parseInt(s, 10);
  if (!amount) return null;
  return { amount, currency: 'COP', bank: 'unknown', parser: 'generic' };
}

export function matches() { return false; }  // generic nunca matches por sender
