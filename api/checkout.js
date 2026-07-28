// PawCal — crée une session Stripe Checkout (mode abonnement).
//
// Stripe héberge la page de paiement : aucune donnée de carte ne transite par
// notre serveur ni par l'app. On renvoie simplement l'URL, le navigateur y va.
//
// Variables d'environnement Vercel :
//   STRIPE_SECRET_KEY   sk_live_... (ou sk_test_... pour essayer)
//   STRIPE_PRICE_YEAR   price_... abonnement annuel
//   STRIPE_PRICE_MONTH  price_... abonnement mensuel
//   TRIAL_DAYS          optionnel, défaut 7 — mettre 0 pour supprimer l'essai
//   STRIPE_TAX=1        optionnel, UNIQUEMENT si Stripe Tax est configuré,
//                       sinon chaque session échoue

const { stripe, cors } = require('./_stripe');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { plan, lang, origin, email } = req.body || {};

  const price = (plan === 'mon'
    ? process.env.STRIPE_PRICE_MONTH
    : process.env.STRIPE_PRICE_YEAR || '').trim();

  if (!price) {
    return res.status(500).json({
      error: `Variable manquante : ${plan === 'mon' ? 'STRIPE_PRICE_MONTH' : 'STRIPE_PRICE_YEAR'}`
    });
  }
  if (!/^price_/.test(price)) {
    return res.status(500).json({ error: 'La variable ne contient pas un identifiant price_...' });
  }

  const base = origin || `https://${req.headers.host}`;
  const trial = parseInt(process.env.TRIAL_DAYS || '7', 10);

  const body = {
    mode: 'subscription',
    line_items: [{ price, quantity: 1 }],
    success_url: `${base}/?paid=1&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${base}/?checkout=cancelled`,
    allow_promotion_codes: true,
    locale: lang === 'fr' ? 'fr' : 'en',
    billing_address_collection: 'auto'
  };

  // L'email est l'identifiant du compte : il permet de retrouver l'abonnement
  // sur un autre téléphone. En mode subscription, Stripe crée le client seul.
  if (email) body.customer_email = String(email).trim().toLowerCase();

  if (trial > 0) body.subscription_data = { trial_period_days: trial };

  // Stripe Tax n'est activable qu'une fois configuré dans le dashboard,
  // sinon la requête est rejetée. On ne l'active donc que sur demande.
  if (process.env.STRIPE_TAX === '1') body.automatic_tax = { enabled: true };

  try {
    const session = await stripe('/checkout/sessions', {
      method: 'POST',
      body,
      // évite de créer deux abonnements sur un double-clic
      idempotencyKey: `pawcal_${plan}_${email || 'anon'}_${Math.floor(Date.now() / 60000)}`
    });
    return res.status(200).json({ url: session.url, id: session.id });
  } catch (e) {
    return res.status(502).json({ error: e.message, code: e.code });
  }
};
