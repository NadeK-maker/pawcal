// PawCal — source de vérité de l'abonnement, interrogée par email.
//
// C'est ce qui remplace une base de données pour la v1 :
//   • l'utilisateur change de téléphone → il saisit son email → accès restauré
//   • l'utilisateur annule → Stripe le sait → l'app le sait au prochain contrôle
// Stripe reste la seule source de vérité, on ne stocke rien de notre côté.

const { stripe, ACTIVE, cors } = require('./_stripe');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const email = String((req.query && req.query.email) || '').trim().toLowerCase();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return res.status(400).json({ premium: false, error: 'email invalide' });
  }

  try {
    const customers = await stripe(`/customers?email=${encodeURIComponent(email)}&limit=10`);
    if (!customers.data.length) return res.status(200).json({ premium: false, reason: 'no_customer' });

    for (const c of customers.data) {
      const subs = await stripe(`/subscriptions?customer=${c.id}&status=all&limit=10`);
      const live = subs.data.find(s => ACTIVE.has(s.status));
      if (live) {
        return res.status(200).json({
          premium: true,
          status: live.status,
          current_period_end: live.current_period_end,
          cancel_at_period_end: live.cancel_at_period_end
        });
      }
    }
    return res.status(200).json({ premium: false, reason: 'no_active_subscription' });
  } catch (e) {
    // En cas de panne Stripe, on ne coupe PAS l'accès : on renvoie "inconnu".
    // L'app garde alors l'état qu'elle avait — on ne punit pas un client qui paie.
    return res.status(200).json({ premium: null, error: e.message });
  }
};
