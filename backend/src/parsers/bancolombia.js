// Parser de emails de Bancolombia (Colombia)
//
// Formato tipico de notificacion:
//
//   From: alertasynotificaciones@notificacionesbancolombia.com
//   Subject: Bancolombia te informa Recepcion transferencia
//   Body: ...Recibiste una transferencia por $50.000 de JUAN PEREZ...
//   O:    ...Tu cuenta de ahorros termina en XXXX recibio $12.345...

export const name = 'bancolombia';

export function matches(from, subject = '') {
  return (
    from.includes('bancolombia.com') ||
    from.includes('@notificacionesbancolombia.com') ||
    (subject.toLowerCase().includes('bancolombia'))
  );
}

export function parse(text) {
  if (!text) return null;

  // Patrones a probar en orden
  const patterns = [
    // "Recibiste una transferencia por $50.000"
    /recib(?:iste|imos|i[oó])\s+(?:una?\s+)?(?:transferencia|consignaci[oó]n|pago|abono)\s+(?:por\s+)?\$?\s?([\d.,]+)/i,
    // "abono por $12.345"
    /abono\s+(?:por\s+)?\$?\s?([\d.,]+)/i,
    // "te abonaron $X" / "depositaron $X"
    /(?:te\s+abonaron|depositaron|consignaron|transfirieron)\s+\$?\s?([\d.,]+)/i,
    // "recibio $X" (cuenta termina en XXXX recibio $X)
    /recibi[oó]\s+\$?\s?([\d.,]+)/i,
    // Genericos con simbolo de moneda
    /\$\s?([\d.,]+)\s*(?:pesos|cop)?/i,
  ];

  for (const re of patterns) {
    const m = text.match(re);
    if (m) {
      const amount = parseAmount(m[1]);
      if (amount > 0) {
        return { amount, currency: 'COP', bank: 'bancolombia', ref: null };
      }
    }
  }

  return null;
}

function parseAmount(str) {
  if (!str) return 0;
  // En CO usan punto como separador de miles: 50.000 = 50000
  // Si hay coma, suele ser decimal (50.000,50)
  // Para pagos cotidianos los decimales son irrelevantes, solo tomamos parte entera.
  let s = String(str).trim();
  // Si tiene tanto punto como coma -> separator es la coma (decimal)
  if (s.includes(',') && s.includes('.')) {
    s = s.split(',')[0].replace(/\./g, '');
  } else if (s.includes(',') && !s.includes('.')) {
    // solo coma -> decimal o miles?  En CO casi siempre es decimal cuando hay solo una.
    // 50,000 -> seguramente decimal raro, lo limpiamos
    s = s.split(',')[0];
  } else {
    // solo puntos -> miles
    s = s.replace(/\./g, '');
  }
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : 0;
}
