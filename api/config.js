// PawCal — configuration publique du paiement.
//
// Le serveur décide seul quel prestataire est actif, en regardant quelles
// variables d'environnement sont remplies. L'app n'a rien à savoir d'avance :
// le jour où les clés Stripe sont posées dans Vercel, le paiement s'allume
// tout seul, sans toucher au code.
//
// Ordre de priorité : Stripe > Paddle > aucun.
//
// Variables Vercel — Stripe (à remplir au Canada) :
//   STRIPE_SECRET_KEY    sk_live_... (ou sk_test_... pour essayer)
//   STRIPE_PRICE_YEAR    price_... de l'abonnement annuel
//   STRIPE_PRICE_MONTH   price_... de l'abonnement mensuel
//
// Variables Vercel — Paddle (héritage, en pause) :
//   PADDLE_ENV, PADDLE_CLIENT_TOKEN, PADDLE_PRICE_YEAR, PADDLE_PRICE_MONTH

module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');

  const sk = (process.env.STRIPE_SECRET_KEY || '').trim();
  const sYear = (process.env.STRIPE_PRICE_YEAR || '').trim();
  const sMonth = (process.env.STRIPE_PRICE_MONTH || '').trim();

  if (sk && sYear && sMonth) {
    return res.status(200).json({
      provider: 'stripe',
      configured: true,
      // mode test ou réel : utile pour afficher un bandeau côté app
      live: sk.indexOf('sk_live_') === 0,
      priceYear: sYear,
      priceMonth: sMonth
    });
  }

  const token = (process.env.PADDLE_CLIENT_TOKEN || '').trim();
  const pYear = (process.env.PADDLE_PRICE_YEAR || '').trim();
  const pMonth = (process.env.PADDLE_PRICE_MONTH || '').trim();

  if (token && pYear && pMonth) {
    return res.status(200).json({
      provider: 'paddle',
      configured: true,
      env: process.env.PADDLE_ENV === 'production' ? 'production' : 'sandbox',
      token,
      priceYear: pYear,
      priceMonth: pMonth
    });
  }

  res.status(200).json({ provider: 'none', configured: false });
};
