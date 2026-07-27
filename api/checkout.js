// PawCal — crée une session de paiement Stripe Checkout (mode abonnement).
//
// Variables d'environnement Vercel :
//   STRIPE_SECRET_KEY   (sk_test_... puis sk_live_...)
//   STRIPE_PRICE_YEAR   (price_... abonnement annuel)
//   STRIPE_PRICE_MONTH  (price_... abonnement mensuel)
//   STRIPE_TAX=1        (optionnel : uniquement si Stripe Tax est configuré)
//   TRIAL_DAYS=7        (optionnel, défaut 7)

const { stripe, cors } = require('./_stripe');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { plan, lang, origin, email } = req.body || {};
  // Tarifs créés le 27/07/2026 dans le compte Stripe Pawcal (mode TEST).
  // Les identifiants price_ sont publics (pas des secrets). En passant en mode
  // réel, remplace-les via les variables d'environnement STRIPE_PRICE_YEAR/MONTH.
  const DEFAULT_YEAR = 'price_1TxiVOBwNOSVoML0MzcN05yG';   // 39,99 € / an
  const DEFAULT_MONTH = 'price_1TxiYbBwNOSVoML0coEYyzOP';  // 7,99 € / mois
  const price = plan === 'mon'
    ? (process.env.STRIPE_PRICE_MONTH || DEFAULT_MONTH)
    : (process.env.STRIPE_PRICE_YEAR || DEFAULT_YEAR);
  if (!price) return res.status(500).json({ error: `Price ID manquant (${plan === 'mon' ? 'STRIPE_PRICE_MONTH' : 'STRIPE_PRICE_YEAR'})` });
  if (!/^price_/.test(price)) return res.status(500).json({ error: 'La variable contient un identifiant qui ne commence pas par price_' });

  const base = origin || `https://${req.headers.host}`;
  const trial = parseInt(process.env.TRIAL_DAYS || '7', 10);

  const body = {
    mode: 'subscription',
    line_items: [{ price, quantity: 1 }],
    success_url: `${base}/?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${base}/?checkout=cancelled`,
    allow_promotion_codes: true,
    locale: lang === 'fr' ? 'fr' : 'en',
    // On force la collecte de l'email : c'est l'identifiant qui permettra à
    // l'utilisateur de retrouver son abonnement sur un autre appareil.
        billing_address_collection: 'auto',
    subscription_data: { trial_period_days: trial > 0 ? trial : undefined },
    // Stripe facture et archive automatiquement chaque échéance (Billing + Invoicing).
    // Le client reçoit sa facture par email et la retrouve dans le portail.
    consent_collection: { terms_of_service: 'none' }
  };
  if (email) body.customer_email = email;

  // Stripe Tax n'est activable que si tu l'as configuré dans le dashboard,
  // sinon la requête échoue. On ne l'active donc que sur demande explicite.
  if (process.env.STRIPE_TAX === '1') body.automatic_tax = { enabled: true };

  try {
    const session = await stripe('/checkout/sessions', {
      method: 'POST',
      body,
      idempotencyKey: `pawcal_${plan}_${email || 'anon'}_${Math.floor(Date.now() / 60000)}`
    });
    return res.status(200).json({ url: session.url, id: session.id });
  } catch (e) {
    return res.status(502).json({ error: e.message, code: e.code });
  }
};
