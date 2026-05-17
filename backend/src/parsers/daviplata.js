// Parser Daviplata (Colombia)

export const name = 'daviplata';

export function matches(from, subject = '') {
  return (
    from.includes('daviplata') ||
    from.includes('@davivienda.com') && /daviplata/i.test(subject) ||
    /daviplata/i.test(subject)
  );
}

export function parse(text) {
  if (!text) return null;
  const patterns = [
    /(?:recibiste|te\s+enviaron|abonaron)\s+\$?\s?([\d.,]+)/i,
    /\$\s?([\d.,]+)/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) {
      const amount = parseAmount(m[1]);
      if (amount > 0) return { amount, currency: 'COP', bank: 'daviplata', ref: null };
    }
  }
  return null;
}

function parseAmount(str) {
  if (!str) return 0;
  let s = String(str).trim();
  if (s.includes(',') && s.includes('.')) s = s.split(',')[0].replace(/\./g, '');
  else if (s.includes(',')) s = s.split(',')[0];
  else s = s.replace(/\./g, '');
  return parseInt(s, 10) || 0;
}
