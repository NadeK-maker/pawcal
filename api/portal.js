// PawCal — portail client Paddle.
// Une seule adresse qui donne à l'utilisateur : ses factures, le changement
// de moyen de paiement, l'annulation en autonomie.
// Réduit le support client à presque rien.

const API = () =>
  process.env.PADDLE_ENV === 'production'
    ? 'https://api.paddle.com'
    : 'https://sandbox-api.paddle.com';

async function paddle(path, opts = {}) {
    const key = (process.env.PADDLE_API_KEY || '').trim();
  if (!key) throw new Error('PADDLE_API_KEY manquante sur le serveur');
  const r = await fetch(`${API()}${path}`, {
    method: opts.method || 'GET',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json'
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  const j = await r.json();
  if (!r.ok) throw new Error((j.error && j.error.detail) || `Paddle HTTP ${r.status}`);
  return j;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const email = String((req.body && req.body.email) || '').trim().toLowerCase();
  if (!email) return res.status(400).json({ error: 'email requis' });

  try {
    const customers = await paddle(`/customers?email=${encodeURIComponent(email)}`);
    if (!customers.data || !customers.data.length) {
      return res.status(404).json({ error: 'Aucun compte trouvé pour cet email' });
    }
    const session = await paddle(`/customers/${customers.data[0].id}/portal-sessions`, {
      method: 'POST',
      body: {}
    });
    const url =
      session.data && session.data.urls && session.data.urls.general
        ? session.data.urls.general.overview
        : null;
    if (!url) return res.status(502).json({ error: 'portail indisponible' });
    return res.status(200).json({ url });
  } catch (e) {
    return res.status(502).json({ error: e.message });
  }
};
