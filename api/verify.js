// Scoopy — vérifie qu'une session Checkout est bien payée, au retour de Stripe.
// C'est le SERVEUR qui tranche : le navigateur ne peut pas se déclarer Premium.

const { stripe, ACTIVE, cors } = require('./_stripe');
const { dodo, dodoOn, isOurs, ACTIVE: DODO_ACTIVE } = require('./_dodo');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  // Retour de Dodo : ?subscription_id=sub_...
  const subId = (req.query && req.query.subscription_id) || '';
  if (subId && dodoOn()) {
    try {
      const s = await dodo(`/subscriptions/${encodeURIComponent(subId)}`);
      return res.status(200).json({
        premium: DODO_ACTIVE.has(s.status) && isOurs(s),
        email: (s.customer && s.customer.email) || null,
        status: s.status,
        current_period_end: s.next_billing_date || null
      });
    } catch (e) {
      return res.status(502).json({ premium: false, error: e.message });
    }
  }

  const id = (req.query && req.query.session_id) || '';
  if (!id) return res.status(400).json({ premium: false, error: 'session_id requis' });

  try {
    // On récupère l'abonnement en même temps que la session (une seule requête).
    const s = await stripe(`/checkout/sessions/${encodeURIComponent(id)}?expand[]=subscription`);

    const sub = s.subscription;
    const paid = s.payment_status === 'paid' || s.payment_status === 'no_payment_required';
    const subOk = sub ? ACTIVE.has(sub.status) : false;

    return res.status(200).json({
      premium: paid || subOk,
      email: (s.customer_details && s.customer_details.email) || null,
      status: sub ? sub.status : s.status,
      // Fin de la période en cours, pour informer l'utilisateur.
      current_period_end: sub ? sub.current_period_end : null
    });
  } catch (e) {
    return res.status(502).json({ premium: false, error: e.message });
  }
};
