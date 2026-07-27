// PawCal — portail client Stripe.
//
// Une seule adresse qui donne à l'utilisateur, sans que tu écrives une ligne d'interface :
//   • ses factures (Invoicing) téléchargeables en PDF
//   • le changement de carte bancaire
//   • l'annulation en autonomie
//   • le changement de plan mensuel <-> annuel
//
// Réduit massivement le support client, et c'est exigé par Apple/Google
// le jour où tu passes sur les stores.
//
// À activer une fois dans le dashboard : Paramètres → Facturation → Portail client.

const { stripe, cors } = require('./_stripe');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { email, origin } = req.body || {};
  const clean = String(email || '').trim().toLowerCase();
  if (!clean) return res.status(400).json({ error: 'email requis' });

  const base = origin || `https://${req.headers.host}`;

  try {
    const customers = await stripe(`/customers?email=${encodeURIComponent(clean)}&limit=1`);
    if (!customers.data.length) return res.status(404).json({ error: 'Aucun compte trouvé pour cet email' });

    const session = await stripe('/billing_portal/sessions', {
      method: 'POST',
      body: { customer: customers.data[0].id, return_url: base }
    });
    return res.status(200).json({ url: session.url });
  } catch (e) {
    return res.status(502).json({ error: e.message });
  }
};
