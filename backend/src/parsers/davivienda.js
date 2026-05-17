// Parser Davivienda
export const name = 'davivienda';

export function matches(from, subject = '') {
  return (
    from.includes('@davivienda.com') && !/daviplata/i.test(subject)
  );
}

export function parse(text) {
  if (!text) return null;
  const m = text.match(/(?:abono|recibi[oó]|transferencia|consignaci[oó]n)\s+(?:por\s+)?\$?\s?([\d.,]+)/i) ||
            text.match(/\$\s?([\d.,]+)/i);
  if (!m) return null;
  const amount = parseAmount(m[1]);
  if (amount <= 0) return null;
  return { amount, currency: 'COP', bank: 'davivienda', ref: null };
}

function parseAmount(str) {
  let s = String(str).trim();
  if (s.includes(',') && s.includes('.')) s = s.split(',')[0].replace(/\./g, '');
  else if (s.includes(',')) s = s.split(',')[0];
  else s = s.replace(/\./g, '');
  return parseInt(s, 10) || 0;
}
