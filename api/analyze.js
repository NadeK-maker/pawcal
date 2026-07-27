// PawCal — proxy serveur pour Google Gemini.
// La clé API vit ici, côté serveur (variable d'environnement GEMINI_API_KEY).
// Elle n'apparaît jamais dans le code envoyé aux utilisateurs.

const MODELS = ['gemini-flash-latest', 'gemini-2.5-flash', 'gemini-1.5-flash'];

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(500).json({ error: 'GEMINI_API_KEY manquante sur le serveur' });

  const b = req.body || {};
  // Accepte soit { images: [{data,mime}] } (nouvelle version), soit { image, mime } (ancienne).
  const images = Array.isArray(b.images) && b.images.length
    ? b.images
    : (b.image ? [{ data: b.image, mime: b.mime }] : []);
  if (!b.prompt || !images.length) return res.status(400).json({ error: 'prompt et au moins une image requis' });
  if (images.length > 6) return res.status(400).json({ error: '6 images maximum' });

  const parts = [{ text: b.prompt }];
  for (const im of images) {
    parts.push({ inline_data: { mime_type: im.mime || 'image/jpeg', data: im.data } });
  }

  const body = JSON.stringify({
    contents: [{ parts }],
    generationConfig: { temperature: 0.2, responseMimeType: 'application/json' }
  });

  let lastErr = 'unknown';
  for (const model of MODELS) {
    try {
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body }
      );
      const j = await r.json();
      if (!r.ok) {
        lastErr = (j.error && j.error.message) || `HTTP ${r.status}`;
        if (/not found|not supported|unsupported/i.test(lastErr)) continue; // essaie le modèle suivant
        return res.status(502).json({ error: lastErr });
      }
      const c = j.candidates && j.candidates[0];
      if (!c) { lastErr = 'réponse vide'; continue; }
      const text = c.content.parts.map(p => p.text || '').join('');
      return res.status(200).json({ text });
    } catch (e) {
      lastErr = e.message;
    }
  }
  return res.status(502).json({ error: lastErr });
};
