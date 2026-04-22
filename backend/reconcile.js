const CASH_THRESHOLD = 5;
const CARD_THRESHOLD = 5;
const HIGH_DISCOUNTS = 200;
const HIGH_COMPS = 50;

function reconcile(managerReport, squareData) {
  const cashVar = round(squareData.cash - managerReport.cash_sales);
  const cardVar = round(squareData.card - managerReport.card_sales);
  const totalVar = round(squareData.total - managerReport.total_sales);
  const flags = [];

  if (Math.abs(cashVar) > CASH_THRESHOLD)
    flags.push({ type: 'cash', message: `Cash variance £${Math.abs(cashVar).toFixed(2)}`, value: cashVar });

  if (Math.abs(cardVar) > CARD_THRESHOLD)
    flags.push({ type: 'card', message: `Card variance £${Math.abs(cardVar).toFixed(2)}`, value: cardVar });

  if (squareData.discounts > HIGH_DISCOUNTS)
    flags.push({ type: 'discounts', message: `High discounts £${squareData.discounts.toFixed(2)}`, value: squareData.discounts });

  if (squareData.refunds > 0)
    flags.push({ type: 'refunds', message: `Refunds £${squareData.refunds.toFixed(2)} — check notes`, value: squareData.refunds });

  if (squareData.comps > HIGH_COMPS)
    flags.push({ type: 'comps', message: `Comps £${squareData.comps.toFixed(2)}`, value: squareData.comps });

  return {
    cashVar,
    cardVar,
    totalVar,
    flags,
    status: flags.length === 0 ? 'ok' : 'warn',
  };
}

function round(n) {
  return Math.round(n * 100) / 100;
}

module.exports = { reconcile };
