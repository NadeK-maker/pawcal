// PawCal — source de vérité de l'abonnement, interrogée par email.
//
//   • l'utilisateur change de téléphone → il saisit son email → accès restauré
//   • l'utilisateur annule → le prestataire le sait → l'app le sait au prochain
//     contrôle quotidien
//
// On ne stocke aucune base de données : le prestataire de paiement fait foi.
// Stripe est utilisé s'il est configuré, sinon Paddle (héritage).
//
// Variables d'environnement Vercel :
//   STRIPE_SECRET_KEY   → mode Stripe
//   PADDLE_API_KEY + PADDLE_ENV → mode Paddle

// Statuts qui donnent accès : actif, en essai, et impayé en période de grâce
// (on ne coupe pas un client pour un simple raté de carte).
const ACTIVE = new Set(['active', 'trialing', 'past_due']);

/* ------------------------------- STRIPE ------------------------------- */
async function stripeGet(path) {
  const sk = (process.env.STRIPE_SECRET_KEY || '').trim();
  const r = await fetch(`https://api.stripe.com/v1${path}`, {
    headers: { Authorization: `Bearer ${sk}` }
  });
  const j = await r.json();
  if (!r.ok) throw new Error((j.error && j.error.message) || `Stripe HTTP ${r.status}`);
  return j;
}

async function viaStripe(email) {
  const customers = await stripeGet(`/customers?email=${encodeURIComponent(email)}&limit=10`);
  if (!customers.data || !customers.data.length) {
    return { premium: false, reason: 'no_customer' };
  }
  for (const c of customers.data) {
    const subs = await stripeGet(`/subscriptions?customer=${c.id}&status=all&limit=20`);
    const live = (subs.data || []).find(s => ACTIVE.has(s.status));
    if (live) {
      return {
        premium: true,
        provider: 'stripe',
        status: live.status,
        customer_id: c.id,
        current_period_end: live.current_period_end || null,
        cancel_at_period_end: !!live.cancel_at_period_end
      };
    }
  }
  return { premium: false, reason: 'no_active_subscription' };
}

/* ------------------------------- PADDLE ------------------------------- */
async function paddleGet(path) {
  const key = (process.env.PADDLE_API_KEY || '').trim();
  const base = process.env.PADDLE_ENV === 'production'
    ? 'https://api.paddle.com'
    : 'https://sandbox-api.paddle.com';
  const r = await fetch(`${base}${path}`, { headers: { Authorization: `Bearer ${key}` } });
  const j = await r.json();
  if (!r.ok) throw new Error((j.error && j.error.detail) || `Paddle HTTP ${r.status}`);
  return j;
}

async function viaPaddle(email) {
  const customers = await paddleGet(`/customers?email=${encodeURIComponent(email)}`);
  if (!customers.data || !customers.data.length) {
    return { premium: false, reason: 'no_customer' };
  }
  for (const c of customers.data) {
    const subs = await paddleGet(`/subscriptions?customer_id=${c.id}`);
    const live = (subs.data || []).find(s => ACTIVE.has(s.status));
    if (live) {
      return {
        premium: true,
        provider: 'paddle',
        status: live.status,
        customer_id: c.id,
        next_billed_at: live.next_billed_at || null,
        scheduled_change: live.scheduled_change || null
      };
    }
  }
  return { premium: false, reason: 'no_active_subscription' };
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');

  const email = String((req.query && req.query.email) || '').trim().toLowerCase();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return res.status(400).json({ premium: false, error: 'email invalide' });
  }

  const hasStripe = !!(process.env.STRIPE_SECRET_KEY || '').trim();
  const hasPaddle = !!(process.env.PADDLE_API_KEY || '').trim();
  if (!hasStripe && !hasPaddle) {
    return res.status(200).json({ premium: false, reason: 'no_provider' });
  }

  try {
    const out = hasStripe ? await viaStripe(email) : await viaPaddle(email);
    return res.status(200).json(out);
  } catch (e) {
    // Prestataire injoignable → on renvoie "inconnu" : l'app garde l'état
    // qu'elle a. On ne punit jamais un client qui paie pour une panne réseau.
    return res.status(200).json({ premium: null, error: e.message });
  }
};
