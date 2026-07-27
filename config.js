// PawCal — configuration publique du paiement Paddle.
// Renvoie au navigateur UNIQUEMENT des valeurs publiques (le client token
// Paddle est fait pour être public, comme les price IDs).
// Variables d'environnement Vercel :
//   PADDLE_ENV           'sandbox' (test) ou 'production'
//   PADDLE_CLIENT_TOKEN  token côté client (commence par test_ ou live_)
//   PADDLE_PRICE_YEAR    pri_... de l'abonnement annuel
//   PADDLE_PRICE_MONTH   pri_... de l'abonnement mensuel

module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const token = process.env.PADDLE_CLIENT_TOKEN || '';
  const priceYear = process.env.PADDLE_PRICE_YEAR || '';
  const priceMonth = process.env.PADDLE_PRICE_MONTH || '';
  res.status(200).json({
    configured: !!(token && priceYear && priceMonth),
    env: process.env.PADDLE_ENV === 'production' ? 'production' : 'sandbox',
    token,
    priceYear,
    priceMonth
  });
};
