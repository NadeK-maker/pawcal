// PawCal — source de vérité de l'abonnement, interrogée par email (Paddle).
//
//   • l'utilisateur change de téléphone → il saisit son email → accès restauré
//   • l'utilisateur annule → Paddle le sait → l'app le sait au prochain contrôle
// Paddle est la seule source de vérité, on ne stocke rien de notre côté.
//
// Variables d'environnement Vercel :
//   PADDLE_API_KEY   clé API secrète Paddle (ne quitte jamais le serveur)
//   PADDLE_ENV       'sandbox' ou 'production'

const API = () =>
  process.env.PADDLE_ENV === 'production'
    ? 'https://api.paddle.com'
    : 'https://sandbox-api.paddle.com';

async function paddle(path) {
  const key = process.env.PADDLE_API_KEY;
  if (!key) throw new Error('PADDLE_API_KEY manquante sur le serveur');
  const r = await fetch(`${API()}${path}`, {
    headers: { Authorization: `Bearer ${key}` }
  });
  const j = await r.json();
  if (!r.ok) throw new Error((j.error && j.error.detail) || `Paddle HTTP ${r.status}`);
  return j;
}

// Statuts qui donnent accès : actif, en essai, et impayé en période de grâce
// (on ne coupe pas un client pour un simple raté de carte).
const ACTIVE = new Set(['active', 'trialing', 'past_due']);

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const email = String((req.query && req.query.email) || '').trim().toLowerCase();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return res.status(400).json({ premium: false, error: 'email invalide' });
  }

  try {
    const customers = await paddle(`/customers?email=${encodeURIComponent(email)}`);
    if (!customers.data || !customers.data.length) {
      return res.status(200).json({ premium: false, reason: 'no_customer' });
    }

    for (const c of customers.data) {
      const subs = await paddle(`/subscriptions?customer_id=${c.id}`);
      const live = (subs.data || []).find(s => ACTIVE.has(s.status));
      if (live) {
        return res.status(200).json({
          premium: true,
          status: live.status,
          customer_id: c.id,
          next_billed_at: live.next_billed_at || null,
          scheduled_change: live.scheduled_change || null
        });
      }
    }
    return res.status(200).json({ premium: false, reason: 'no_active_subscription' });
  } catch (e) {
    // Paddle injoignable → on renvoie "inconnu" : l'app garde l'état qu'elle a.
    // On ne punit jamais un client qui paie à cause d'une panne réseau.
    return res.status(200).json({ premium: null, error: e.message });
  }
};
