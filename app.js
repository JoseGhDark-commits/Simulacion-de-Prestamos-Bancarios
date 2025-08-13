const currencyLocale = (ccy) => ({
  MXN: 'es-MX',
  USD: 'en-US',
  EUR: 'es-ES',
}[ccy] || 'es-MX');
const fmtMoney = (n, ccy) => n.toLocaleString(currencyLocale(ccy), { style: 'currency', currency: ccy, maximumFractionDigits: 2 });
const num = (value) => {
  const n = typeof value === 'number' ? value : parseFloat(String(value).replace(/,/g, ''));
  return Number.isFinite(n) ? n : NaN;
};
const buildSchedule = (amount, annualRatePct, weeks, weeklyPayment) => {
  const schedule = [];
  let balance = amount;
  const weeklyRate = annualRatePct / 100 / 52;

  if (weeklyRate * balance >= weeklyPayment) {
    const msg = 'El pago semanal es insuficiente para cubrir los intereses. Aumenta el pago.';
    throw new Error(msg);
  }

  for (let w = 1; w <= weeks; w++) {
    const interest = balance * weeklyRate;
    const due = balance + interest;
    const payment = Math.min(weeklyPayment, due);
    balance = due - payment;
    if (balance < 0) balance = 0;
    schedule.push({ week: w, interest, payment, balance });
    if (balance <= 0) break;
  }
  return schedule;
};
const $ = (id) => document.getElementById(id);
const els = {
  form: $('loan-form'),
  btnCalc: $('btn-calc'),
  btnPdf: $('btn-pdf'),
  error: $('form-error'),
  results: $('results'),
  totalPaid: $('total-paid'),
  totalInterest: $('total-interest'),
  weeksPaid: $('weeks-paid'),
  tableBody: document.querySelector('#schedule-table tbody'),
  currency: $('currency'),
};

const readInputs = () => ({
  amount: num($('amount').value),
  rate: num($('interest-rate').value),
  weeks: parseInt($('weeks').value, 10),
  weeklyPayment: num($('weekly-payment').value),
  currency: (els.currency && els.currency.value) || 'MXN',
});

const validate = ({ amount, rate, weeks, weeklyPayment }) => {
  if ([amount, rate, weeks, weeklyPayment].some((v) => Number.isNaN(v))) return 'Por favor, completa todos los campos con valores válidos.';
  if (amount <= 0) return 'El monto debe ser mayor a 0.';
  if (rate < 0) return 'La tasa no puede ser negativa.';
  if (!Number.isInteger(weeks) || weeks <= 0) return 'Las semanas deben ser un entero mayor a 0.';
  if (weeklyPayment <= 0) return 'El pago semanal debe ser mayor a 0.';
  return '';
};

const renderResults = (schedule, weeklyPayment, amount, currency) => {
  const weeksPaid = schedule.length;
  const totalInterest = schedule.reduce((acc, r) => acc + r.interest, 0);
  const totalPaid = schedule.reduce((acc, r) => acc + (r.payment || 0), 0);

  els.totalPaid.textContent = fmtMoney(totalPaid, currency);
  els.totalInterest.textContent = fmtMoney(totalInterest, currency);
  els.weeksPaid.textContent = String(weeksPaid);
  els.tableBody.innerHTML = '';
  const frag = document.createDocumentFragment();
  schedule.forEach((r) => {
    const tr = document.createElement('tr');
    const tdW = document.createElement('td'); tdW.textContent = r.week;
    const tdI = document.createElement('td'); tdI.textContent = fmtMoney(r.interest, currency);
    const tdB = document.createElement('td'); tdB.textContent = fmtMoney(r.balance, currency);
    tr.append(tdW, tdI, tdB);
    frag.appendChild(tr);
  });
  els.tableBody.appendChild(frag);

  els.results.hidden = false;
};

const calculate = () => {
  els.error.hidden = true; els.error.textContent = '';
  try {
    const data = readInputs();
    const err = validate(data);
    if (err) { els.error.textContent = err; els.error.hidden = false; els.results.hidden = true; return null; }
    const schedule = buildSchedule(data.amount, data.rate, data.weeks, data.weeklyPayment);
    renderResults(schedule, data.weeklyPayment, data.amount, data.currency);
    return { schedule, ...data };
  } catch (e) {
    els.error.textContent = e.message || 'Ocurrió un error al calcular.';
    els.error.hidden = false;
    els.results.hidden = true;
    return null;
  }
};

const generatePDF = () => {
  const calc = calculate();
  if (!calc) return;
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF();
  pdf.setFillColor(37, 99, 235);
  pdf.rect(0, 0, pdf.internal.pageSize.getWidth(), 18, 'F');
  pdf.setTextColor(255);
  pdf.setFontSize(14);
  pdf.text('Simulación de Préstamo', 14, 12);
  pdf.setTextColor(0);
  pdf.setFontSize(11);
  const top = 24;
  pdf.text(`Moneda: ${calc.currency}`, 14, top);
  pdf.text(`Monto Prestado: ${fmtMoney(calc.amount, calc.currency)}`, 14, top + 6);
  pdf.text(`Tasa de Interés Anual: ${calc.rate}%`, 14, top + 12);
  pdf.text(`Semanas (máx.): ${calc.weeks}`, 14, top + 18);
  pdf.text(`Pago Semanal: ${fmtMoney(calc.weeklyPayment, calc.currency)}`, 14, top + 24);
  const body = calc.schedule.map((r) => [
    r.week,
    fmtMoney(r.interest, calc.currency),
    fmtMoney(r.payment || 0, calc.currency),
    fmtMoney(r.balance, calc.currency),
  ]);
  pdf.autoTable({
    head: [['Semana', 'Interés', 'Pago', 'Saldo']],
    body,
    startY: top + 34,
    styles: { fontSize: 9, cellPadding: 2 },
    headStyles: { fillColor: [37, 99, 235], textColor: 255 },
    alternateRowStyles: { fillColor: [245, 247, 251] },
    columnStyles: {
      0: { cellWidth: 22 },
      1: { cellWidth: 40 },
      2: { cellWidth: 40 },
      3: { cellWidth: 'auto' },
    },
  });

  const y = pdf.lastAutoTable.finalY + 8;
  const totalPaid = calc.schedule.reduce((a, r) => a + (r.payment || 0), 0);
  const totalInterest = calc.schedule.reduce((a, r) => a + r.interest, 0);
  // Summary box
  pdf.setDrawColor(229, 231, 235);
  pdf.setFillColor(249, 250, 251);
  pdf.roundedRect(12, y - 6, 184, 20, 2, 2, 'FD');
  pdf.setTextColor(0);
  pdf.text(`Total Pagado: ${fmtMoney(totalPaid, calc.currency)}`, 16, y);
  pdf.text(`Interés Total: ${fmtMoney(totalInterest, calc.currency)}`, 16, y + 6);
  const pageH = pdf.internal.pageSize.getHeight();
  pdf.setFontSize(9);
  pdf.setTextColor(107, 114, 128);
  pdf.text('Generado automáticamente • Simulación de Préstamos', 14, pageH - 8);

  pdf.save('simulacion_prestamo.pdf');
};
window.addEventListener('DOMContentLoaded', () => {
  if (els.btnCalc) els.btnCalc.addEventListener('click', calculate);
  if (els.btnPdf) els.btnPdf.addEventListener('click', generatePDF);
  ['amount','interest-rate','weeks','weekly-payment'].forEach((id) => {
    const input = $(id);
    if (input) input.addEventListener('change', () => { if (!els.results.hidden) calculate(); });
  });
  if (els.currency) els.currency.addEventListener('change', () => { if (!els.results.hidden) calculate(); });
});
