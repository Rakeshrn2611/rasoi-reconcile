const { Client, Environment } = require('square');

function getClient() {
  return new Client({
    accessToken: process.env.SQUARE_TOKEN,
    environment: process.env.SQUARE_ENV === 'production' ? Environment.Production : Environment.Sandbox,
  });
}

// Square SDK can return BigInt amounts — normalise to pence then to pounds
function toGBP(money) {
  if (!money) return 0;
  return Number(money.amount ?? 0) / 100;
}

async function fetchAllPayments(client, locationId, beginTime, endTime) {
  const payments = [];
  let cursor;
  do {
    const resp = await client.paymentsApi.listPayments(beginTime, endTime, undefined, cursor, locationId);
    if (resp.result.payments) payments.push(...resp.result.payments);
    cursor = resp.result.cursor;
  } while (cursor);
  return payments;
}

async function fetchAllRefunds(client, locationId, beginTime, endTime) {
  const refunds = [];
  let cursor;
  do {
    const resp = await client.refundsApi.listPaymentRefunds(beginTime, endTime, undefined, cursor, locationId);
    if (resp.result.refunds) refunds.push(...resp.result.refunds);
    cursor = resp.result.cursor;
  } while (cursor);
  return refunds;
}

async function fetchOrders(client, locationId, orderIds) {
  if (!orderIds.length) return [];
  const orders = [];
  for (let i = 0; i < orderIds.length; i += 100) {
    const chunk = orderIds.slice(i, i + 100);
    try {
      const resp = await client.ordersApi.batchRetrieveOrders({ locationId, orderIds: chunk });
      if (resp.result.orders) orders.push(...resp.result.orders);
    } catch (e) {
      console.error('fetchOrders chunk error:', e.message);
    }
  }
  return orders;
}

async function fetchGiftCardActivities(client, locationId, beginTime, endTime) {
  try {
    const activities = [];
    let cursor;
    do {
      const resp = await client.giftCardActivitiesApi.listGiftCardActivities(
        undefined, undefined, locationId, beginTime, endTime, undefined, 100, cursor
      );
      if (resp.result.giftCardActivities) activities.push(...resp.result.giftCardActivities);
      cursor = resp.result.cursor;
    } while (cursor);
    return activities;
  } catch {
    return [];
  }
}

function isComp(name = '', percentage = '') {
  const lower = name.toLowerCase();
  return lower.includes('comp') || lower.includes('compliment') ||
         lower.includes('staff') || lower.includes('foc') ||
         percentage === '100';
}

async function fetchSquareDay(locationId, date) {
  const client = getClient();
  const beginTime = `${date}T00:00:00Z`;
  const endTime   = `${date}T23:59:59Z`;

  const [payments, refunds, giftCardActivities] = await Promise.all([
    fetchAllPayments(client, locationId, beginTime, endTime),
    fetchAllRefunds(client, locationId, beginTime, endTime),
    fetchGiftCardActivities(client, locationId, beginTime, endTime),
  ]);

  const orderIds = [...new Set(payments.filter(p => p.orderId).map(p => p.orderId))];
  const orders = await fetchOrders(client, locationId, orderIds);

  const paymentByOrderId = new Map(payments.map(p => [p.orderId, p]));
  const paymentById      = new Map(payments.map(p => [p.id, p]));

  // ── Summary ────────────────────────────────────────────────────────────────
  let cash = 0, card = 0, total = 0, giftCardPayments = 0;
  for (const p of payments) {
    if (p.status !== 'COMPLETED') continue;
    const amt = toGBP(p.totalMoney);
    total += amt;
    if      (p.sourceType === 'CASH')   cash += amt;
    else if (p.sourceType === 'CARD')   card += amt;
    else if (p.sourceType === 'WALLET') giftCardPayments += amt;
  }
  const totalRefundAmount = refunds.reduce((s, r) => s + toGBP(r.amountMoney), 0);

  // ── Refund details ─────────────────────────────────────────────────────────
  const refundDetails = refunds.map(r => {
    const payment = paymentById.get(r.paymentId);
    return {
      refund_id:      r.id,
      payment_id:     r.paymentId || '',
      receipt_number: payment?.receiptNumber || 'N/A',
      amount:         toGBP(r.amountMoney),
      reason:         r.reason || 'No reason given',
      status:         r.status || '',
    };
  });

  // ── Discount & comp details from orders ───────────────────────────────────
  const discountDetails = [];
  const compDetails = [];
  let totalDiscounts = 0, totalComps = 0;

  for (const order of orders) {
    const payment       = paymentByOrderId.get(order.id);
    const receiptNumber = payment?.receiptNumber || 'N/A';
    const paymentId     = payment?.id || '';

    // Order-level discounts
    for (const d of order.discounts ?? []) {
      const amt  = toGBP(d.amountMoney);
      const name = d.name || 'Unnamed discount';
      if (isComp(name, d.percentage)) {
        compDetails.push({
          order_id: order.id, payment_id: paymentId, receipt_number: receiptNumber,
          item_name: name, variation_name: 'Whole order', quantity: '1', amount: amt,
        });
        totalComps += amt;
      } else {
        discountDetails.push({
          order_id: order.id, payment_id: paymentId, receipt_number: receiptNumber,
          discount_name: name, discount_type: d.type || 'FIXED_AMOUNT',
          amount: amt, percentage: d.percentage || '', scope: 'ORDER',
        });
        totalDiscounts += amt;
      }
    }

    // Line-item level discounts
    for (const item of order.lineItems ?? []) {
      for (const d of item.discounts ?? []) {
        const amt  = toGBP(d.amountMoney);
        const name = d.name || 'Unnamed discount';
        if (isComp(name, d.percentage)) {
          compDetails.push({
            order_id: order.id, payment_id: paymentId, receipt_number: receiptNumber,
            item_name: item.name || 'Unknown item',
            variation_name: item.variationName || '',
            quantity: item.quantity || '1',
            amount: amt || toGBP(item.totalMoney),
          });
          totalComps += amt;
        } else {
          discountDetails.push({
            order_id: order.id, payment_id: paymentId, receipt_number: receiptNumber,
            discount_name: name, discount_type: d.type || 'FIXED_AMOUNT',
            amount: amt, percentage: d.percentage || '', scope: 'LINE_ITEM',
          });
          totalDiscounts += amt;
        }
      }
    }
  }

  // ── Gift card details ──────────────────────────────────────────────────────
  const giftCardDetails = giftCardActivities
    .filter(a => ['REDEEM', 'LOAD', 'ACTIVATE'].includes(a.type))
    .map(a => {
      const payment   = a.paymentId ? paymentById.get(a.paymentId) : null;
      const amtObj    = a.redeemActivityDetails?.amountMoney
                     || a.loadActivityDetails?.amountMoney
                     || a.activateActivityDetails?.amountMoney;
      return {
        activity_type:  a.type,
        payment_id:     a.paymentId || '',
        receipt_number: payment?.receiptNumber || 'N/A',
        amount:         toGBP(amtObj),
        gift_card_last4: a.giftCardGan ? a.giftCardGan.slice(-4) : '????',
      };
    });

  return {
    summary: {
      cash, card, total,
      refunds:    totalRefundAmount,
      discounts:  totalDiscounts,
      comps:      totalComps,
      gift_cards: giftCardPayments,
    },
    refundDetails,
    discountDetails,
    compDetails,
    giftCardDetails,
    raw_json: JSON.stringify({ payments, refunds }),
  };
}

module.exports = { fetchSquareDay };
