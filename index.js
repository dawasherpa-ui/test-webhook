const express = require('express');
const Stripe = require('stripe');
const cors = require('cors');
const bodyParser = require('body-parser');
const axios = require('axios');

const app = express();
const stripe = new Stripe('sk_test_51Pdoi1RuZnZAwk3ChWnOxSTR8evTCEvMqKLV70HZXZSxkAKVURQ09ZCyFxk1r2CCQUS43tcOWj3sqxbveU6S8WlF00voGwb5b9');
const stripeWebhookSecret = 'whsec_3fbbd7f7d6296fecd36546616fdfb6df4dc712c8ccebc70799a07e121db5137a';

app.use(cors());
app.use(bodyParser.raw({ type: 'application/json' }));

const savePaymentStatus = async (paymentId, status, amountPaid, amountDue, grandTotal) => {
  try {
    const res = await axios.get('/bookings', {
      params: { paymentId }
    });
    const bookingId = res.data.data[0].bookingId;

    await axios.patch(`/bookings/${bookingId}`, {
      depositAmount: amountPaid,
      remainingAmount: res.data.data[0].totalAmount - amountPaid,
      paymentStatus: status,
    });
  } catch (error) {
    console.error('Error saving payment status:', error);
  }
};

const handleStripeWebhook = async (event) => {
  const { type, data } = event;
  const obj = data.object;

  const amountPaid = obj.amount_total / 100; // Stripe amounts are in cents
  const amountDue = 0;
  const grandTotal = obj.amount_total / 100;

  switch (type) {
    case 'checkout.session.completed':
    case 'charge.succeeded':
      await savePaymentStatus(obj.id, 'succeeded', amountPaid, amountDue, grandTotal);
      return { message: 'Payment completed!', status: 200 };

    case 'charge.failed':
      await savePaymentStatus(obj.id, 'failed', amountPaid, amountDue, grandTotal);
      return { message: 'Payment failed!', status: 200 };

    case 'charge.refunded':
      await savePaymentStatus(obj.id, 'refunded', amountPaid, amountDue, grandTotal);
      return { message: 'Refund completed!', status: 200 };

    default:
      return { error: 'Unhandled event type', status: 400 };
  }
};

app.post('/webhook', async (req, res) => {
  const sig = req.headers['stripe-signature'];
console.log(sig);
  if (!sig) {
    return res.status(400).send('Stripe Signature missing');
  }

  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, stripeWebhookSecret);
  } catch (err) {
    console.log('Webhook signature verification failed.', err.message);
    return res.status(400).send('Webhook signature verification failed');
  }

  try {
    const webhookResponse = await handleStripeWebhook(event);
    res.status(webhookResponse.status).send(webhookResponse.message);
  } catch (error) {
    console.error('Error in Stripe webhook handler:', error);
    res.status(500).send('Webhook handler failed.');
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
