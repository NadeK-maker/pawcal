// Scoopy — petit utilitaire partagé pour parler à l'API Dodo Payments.
// Aucune dépendance npm : on appelle l'API REST directement.
//
// Dodo est « marchand de référence » : il encaisse les cartes du monde entier
// (Visa, Mastercard, Apple Pay, Google Pay), gère les taxes et les factures,
// puis reverse par virement. Contrairement à Stripe, il accepte les vendeurs
// basés à Djibouti.
//
// Variables d'environnement Vercel :
//   DODO_API_KEY        clé API (dashboard Dodo → Developer → API Keys)
//   DODO_PRODUCT_YEAR   pdt_... produit « abonnement annuel »
//   DODO_PRODUCT_MONTH  pdt_... produit « abonnement mensuel »
//   DODO_ENV=test       optionnel : mode test (test.dodopayments.com)

function env(name) { return (process.env[name] || '').trim(); }

function dodoOn() {
  return !!(env('DODO_API_KEY') && env('DODO_PRODUCT_YEAR') && env('DODO_PRODUCT_MONTH'));
}

function products() { return [env('DODO_PRODUCT_YEAR'), env('DODO_PRODUCT_MONTH')]; }

async function dodo(path, { method = 'GET', body, query } = {}) {
  const key = env('DODO_API_KEY');
  if (!key) throw new Error('DODO_API_KEY manquante sur le serveur');
  const base = env('DODO_ENV') === 'test' ? 'https://test.dodopayments.com' : 'https://live.dodopayments.com';

  let qs = '';
  if (query) {
    const p = new URLSearchParams();
    for (const k of Object.keys(query)) {
      const v = query[k];
      if (v !== undefined && v !== null && v !== '') p.append(k, String(v));
    }
    qs = p.toString() ? `?${p}` : '';
  }

  const headers = { Authorization: `Bearer ${key}` };
  if (body) headers['Content-Type'] = 'application/json';
  const r = await fetch(`${base}${path}${qs}`, { method, headers, body: body ? JSON.stringify(body) : undefined });

  const text = await r.text();
  let j = {};
  try { j = text ? JSON.parse(text) : {}; } catch (e) { j = { message: text }; }
  if (!r.ok) {
    const e = new Error((j && (j.message || j.error || j.code)) || `Dodo HTTP ${r.status}`);
    e.status = r.status;
    e.code = j && j.code;
    throw e;
  }
  return j;
}

// Pendant l'essai gratuit, Dodo garde l'abonnement « active ».
// « on_hold » (paiement refusé) ou « cancelled » ferment l'accès.
const ACTIVE = new Set(['active']);

function isOurs(sub) { return !!sub && products().indexOf(sub.product_id) >= 0; }

// L'email est l'identifiant du compte : on cherche le client Dodo qui le porte,
// puis un abonnement actif à l'un de nos deux produits.
async function activeByEmail(email) {
  const customers = await dodo('/customers', { query: { email, page_size: 10 } });
  for (const c of customers.items || []) {
    if (String(c.email || '').toLowerCase() !== email) continue;
    const subs = await dodo('/subscriptions', { query: { customer_id: c.customer_id, status: 'active', page_size: 20 } });
    const live = (subs.items || []).find(s => ACTIVE.has(s.status) && isOurs(s));
    if (live) return { customer_id: c.customer_id, sub: live };
  }
  return null;
}

module.exports = { dodo, dodoOn, products, isOurs, activeByEmail, ACTIVE, env };
