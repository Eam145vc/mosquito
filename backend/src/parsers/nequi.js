// Parser Nequi (Colombia - billetera digital)
//
// Notificaciones tipicas:
//   From: notificaciones@nequi.com.co  o  no-reply@nequi.com.co
//   Subject: Te enviaron plata / Recibiste / Te transfirieron
//   Body: "Te enviaron $30.000" / "Recibiste $12.500 de Pedro"

export const name = 'nequi';

export function matches(from, subject = '') {
  return (
    from.includes('nequi.com') ||
    from.includes('@nequi.') ||
    /nequi/i.test(subject)
  );
}

export function parse(text) {
  if (!text) return null;

  const patterns = [
    /(?:te\s+enviaron|recibiste|te\s+transfirieron|llegaron|te\s+consignaron)\s+\$?\s?([\d.,]+)/i,
    /(?:enviado|recibido|abono)\s+(?:por\s+)?\$?\s?([\d.,]+)/i,
    /\$\s?([\d.,]+)\s*(?:pesos)?\s+(?:de|por)/i,
    /\$\s?([\d.,]+)/i,
  ];

  for (const re of patterns) {
    const m = text.match(re);
    if (m) {
      const amount = parseAmount(m[1]);
      if (amount > 0) {
        return { amount, currency: 'COP', bank: 'nequi', ref: null };
      }
    }
  }

  return null;
}

function parseAmount(str) {
  if (!str) return 0;
  let s = String(str).trim();
  if (s.includes(',') && s.includes('.')) {
    s = s.split(',')[0].replace(/\./g, '');
  } else if (s.includes(',') && !s.includes('.')) {
    s = s.split(',')[0];
  } else {
    s = s.replace(/\./g, '');
  }
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : 0;
}
