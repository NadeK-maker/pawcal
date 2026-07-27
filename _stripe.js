// PawCal — petit utilitaire partagé pour parler à l'API Stripe.
// Aucune dépendance npm : on appelle l'API REST directement.

const API = 'https://api.stripe.com/v1';

function form(obj, prefix, out) {
  out = out || new URLSearchParams();
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === 'object' && !Array.isArray(v)) form(v, key, out);
    else if (Array.isArray(v)) v.forEach((item, i) => {
      if (typeof item === 'object') form(item, `${key}[${i}]`, out);
      else out.append(`${key}[${i}]`, String(item));
    });
    else out.append(key, String(v));
  }
  return out;
}

async function stripe(path, { method = 'GET', body, idempotencyKey } = {}) {
  const sk = process.env.STRIPE_SECRET_KEY;
  if (!sk) throw new Error('STRIPE_SECRET_KEY manquante sur le serveur');

  const headers = { Authorization: `Bearer ${sk}` };
  let init = { method, headers };

  if (body) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    init.body = form(body).toString();
  }
  // L'idempotence évite de créer deux abonnements si l'utilisateur double-clique
  // ou si le réseau réessaie la requête. Recommandation Stripe.
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;

  const r = await fetch(`${API}${path}`, init);
  const j = await r.json();
  if (!r.ok) {
    const e = new Error((j.error && j.error.message) || `Stripe HTTP ${r.status}`);
    e.status = r.status;
    e.code = j.error && j.error.code;
    throw e;
  }
  return j;
}

// Un abonnement donne accès si Stripe le considère actif ou en période d'essai.
const ACTIVE = new Set(['active', 'trialing']);

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

module.exports = { stripe, form, ACTIVE, cors };
