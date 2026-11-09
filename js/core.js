// Utilitários sem dependências: dinheiro (sempre em centavos), datas e HTML seguro.
window.SAM = window.SAM || {};

(function (SAM) {
  // ---------- HTML com escape automático ----------
  class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
  const esc = (v) => String(v).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
  const piece = (v) => {
    if (v === null || v === undefined || v === false || v === true) return '';
    if (v instanceof Raw) return v.s;
    if (Array.isArray(v)) return v.map(piece).join('');
    return esc(v);
  };
  SAM.html = (strings, ...vals) => new Raw(
    strings.reduce((out, s, i) => out + s + (i < vals.length ? piece(vals[i]) : ''), '')
  );

  // ---------- Dinheiro ----------
  const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  SAM.brl = (cents) => BRL.format((cents || 0) / 100);

  // Converte o texto de um número em centavos, aceitando "1.250,50", "1250,5",
  // "150.50" e "1.250". Retorna null se não for um número válido.
  function numberToCents(raw) {
    const s = String(raw).trim().replace(/[.,]+$/, '');
    if (!/^\d[\d.,]*$/.test(s)) return null;
    let normal;
    if (s.includes(',')) {
      if (!/^\d{1,3}(\.\d{3})*,\d{1,2}$|^\d+,\d{1,2}$/.test(s)) return null;
      normal = s.replace(/\./g, '').replace(',', '.');
    } else if (s.includes('.')) {
      if (/^\d{1,3}(\.\d{3})+$/.test(s)) normal = s.replace(/\./g, '');
      else if (/^\d+\.\d{1,2}$/.test(s)) normal = s;
      else return null;
    } else {
      normal = s;
    }
    const cents = Math.round(parseFloat(normal) * 100);
    return Number.isFinite(cents) ? cents : null;
  }

  SAM.parseMoneyInput = (text) => {
    const cleaned = String(text || '').replace(/r\$/i, '').trim();
    return cleaned ? numberToCents(cleaned) : null;
  };

  // Lê o valor do título de uma tarefa do To Do. Na dúvida retorna null, para a
  // tarefa ser sinalizada em vez de descontar um valor errado do saldo:
  // - "Pagar gráfica - R$ 150,00"  -> 15000
  // - "Pagar gráfica 150,00"       -> 15000
  // - "Comprar 3 camisas"          -> null (número sem R$ nem centavos)
  // - "R$ 100,00 de R$ 500,00"     -> null (dois valores diferentes)
  SAM.parseTitleValue = (title) => {
    const text = String(title || '');
    const unique = (list) => [...new Set(list.filter((c) => c !== null && c > 0))];

    const withSymbol = unique(
      [...text.matchAll(/R\$\s*(\d[\d.,]*)/gi)].map((m) => numberToCents(m[1]))
    );
    if (withSymbol.length === 1) return withSymbol[0];
    if (withSymbol.length > 1) return null;

    // Formato da lista da SAM: "VALOR - descrição" ou "descrição - VALOR".
    // Aqui o traço indica que o número é o valor, mesmo sem centavos ("810 - Palha").
    const leading = text.match(/^\s*(\d[\d.,]*)\s*-\s*\S/);
    if (leading) return numberToCents(leading[1]);
    const trailing = text.match(/(?:^|[^\d\s])\s*-\s*(\d[\d.,]*)\s*$/);
    if (trailing) return numberToCents(trailing[1]);

    const withCents = unique(
      [...text.matchAll(/(?<![\d.,])(\d{1,3}(?:\.\d{3})+,\d{2}|\d+,\d{2})(?![\d])/g)]
        .map((m) => numberToCents(m[1]))
    );
    return withCents.length === 1 ? withCents[0] : null;
  };

  // ---------- Datas (texto AAAA-MM-DD no horário local) ----------
  const pad = (n) => String(n).padStart(2, '0');
  SAM.today = () => {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };
  SAM.monthOf = (iso) => iso.slice(0, 7);
  SAM.addMonths = (month, delta) => {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  };
  SAM.monthLabel = (month) => {
    const [y, m] = month.split('-').map(Number);
    const name = new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long' });
    return `${name[0].toUpperCase()}${name.slice(1)} de ${y}`;
  };
  SAM.fmtDate = (iso) => {
    if (!iso) return '';
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  };
  SAM.fmtDay = (iso) => {
    if (!iso) return '';
    const [, m, d] = iso.split('-');
    return `${d}/${m}`;
  };
  SAM.fmtTime = (ts) => new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  SAM.fmtStamp = (ts) => {
    const d = new Date(ts);
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} às ${SAM.fmtTime(ts)}`;
  };
  // Data de vencimento no mês; "dia 31" em fevereiro vira o último dia do mês.
  SAM.dueDate = (month, day) => {
    const [y, m] = month.split('-').map(Number);
    const last = new Date(y, m, 0).getDate();
    return `${month}-${pad(Math.min(day, last))}`;
  };
  SAM.daysBetween = (fromIso, toIso) => {
    const toUtc = (iso) => { const [y, m, d] = iso.split('-').map(Number); return Date.UTC(y, m - 1, d); };
    return Math.round((toUtc(toIso) - toUtc(fromIso)) / 86400000);
  };

  SAM.uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  SAM.pct = (part, whole) => (whole > 0 ? Math.round((part / whole) * 100) : 0);
  SAM.sum = (list, fn) => list.reduce((total, item) => total + (fn ? fn(item) : item), 0);
})(window.SAM);
