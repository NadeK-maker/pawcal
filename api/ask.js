// PawCal — assistant IA spécialisé animaux de compagnie.
//
// Sécurité : cet assistant N'EST PAS un vétérinaire et ne pose jamais de
// diagnostic. Il oriente, explique, et renvoie vers un vétérinaire dès
// qu'un signe d'urgence apparaît. Les posologies de médicaments sont refusées.
//
// Variable d'environnement : GEMINI_API_KEY

const MODELS = ['gemini-flash-latest', 'gemini-2.5-flash', 'gemini-1.5-flash'];

function systemPrompt(pet, lang) {
  const fr = lang === 'fr';
  const p = pet || {};
  const espece = p.species === 'cat' ? 'chat' : 'chien';
  return `Tu es l'assistant PawCal, spécialisé dans les animaux de compagnie (chiens et chats).
Tu aides sur : nutrition, poids, comportement, hygiène, prévention, compréhension des étiquettes,
questions du quotidien.

ANIMAL SUIVI : ${p.name || 'non renseigné'}, ${espece}, ${p.w || '?'} kg, ${p.age || '?'} ans,
${p.ster === 'y' ? 'stérilisé' : 'non stérilisé'}, objectif quotidien ${p.target || '?'} kcal.
Utilise ces informations pour personnaliser tes réponses quand c'est pertinent.

RÈGLES ABSOLUES — tu ne les enfreins jamais :
1. Tu n'es PAS vétérinaire et tu ne poses JAMAIS de diagnostic. Tu peux expliquer des causes
   possibles, jamais affirmer ce qu'a l'animal.
2. Tu ne donnes JAMAIS de posologie de médicament, ni humain ni vétérinaire. Beaucoup de
   médicaments humains courants (paracétamol, ibuprofène) sont mortels pour le chien et le chat.
   Tu refuses poliment et tu renvoies au vétérinaire.
3. URGENCE — si le message évoque l'un de ces signes, ta PREMIÈRE phrase doit dire d'appeler
   un vétérinaire ou une clinique d'urgence immédiatement, avant toute autre explication :
   ingestion de toxique (chocolat, raisin, xylitol, oignon, antigel, médicament, mort-aux-rats),
   difficulté à respirer, convulsions, ventre gonflé et dur, tentatives de vomir sans résultat,
   saignement, perte de conscience, incapacité à uriner, mise-bas difficile, traumatisme,
   chat qui n'a pas mangé depuis plus de 24 h, refus de boire prolongé, morsure de serpent,
   coup de chaleur.
4. Tu ne recommandes jamais de retarder une consultation.
5. Si la question ne concerne pas les animaux de compagnie, tu le dis gentiment et tu ramènes
   au sujet.

STYLE : ${fr ? 'Réponds en français.' : 'Answer in English.'} Chaleureux, direct, concret.
Maximum 150 mots. Pas de listes à puces sauf si c'est vraiment plus clair. Pas de jargon
inutile. Si tu manques d'une information importante (âge, poids, depuis quand), pose UNE
question précise plutôt que de supposer.

Termine par un rappel du vétérinaire UNIQUEMENT si le sujet touche à la santé — pas pour une
question de nutrition ou de comportement ordinaire, ce serait lourd.`;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const key = (process.env.GEMINI_API_KEY || '').trim();
  if (!key) return res.status(500).json({ error: 'GEMINI_API_KEY manquante sur le serveur' });

  const b = req.body || {};
  const history = Array.isArray(b.history) ? b.history.slice(-10) : [];
  const question = String(b.question || '').trim();
  if (!question) return res.status(400).json({ error: 'question requise' });
  if (question.length > 1000) return res.status(400).json({ error: 'question trop longue' });

  // Historique au format Gemini + la nouvelle question
  const contents = history
    .filter(m => m && m.text)
    .map(m => ({ role: m.role === 'bot' ? 'model' : 'user', parts: [{ text: String(m.text).slice(0, 2000) }] }));
  contents.push({ role: 'user', parts: [{ text: question }] });

  // Les modèles « thinking » consomment le budget de sortie en raisonnement
  // interne : sans précaution la réponse arrive coupée en plein milieu.
  // On tente donc d'abord thinkingBudget:0 ; si l'API refuse ce champ, on
  // réessaie sans lui mais avec un budget de sortie large.
  function makeBody(noThinking) {
    const gen = noThinking
      ? { temperature: 0.6, maxOutputTokens: 900, thinkingConfig: { thinkingBudget: 0 } }
      : { temperature: 0.6, maxOutputTokens: 3000 };
    return JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt(b.pet, b.lang) }] },
      contents,
      generationConfig: gen,
      safetySettings: [
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' }
      ]
    });
  }

  const ATTEMPTS = [];
  for (const model of MODELS) {
    if (!/1\.5/.test(model)) ATTEMPTS.push({ model, noThinking: true });
    ATTEMPTS.push({ model, noThinking: false });
  }

  let lastErr = 'unknown';
  for (const att of ATTEMPTS) {
    const model = att.model;
    const body = makeBody(att.noThinking);
    try {
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body }
      );
      const j = await r.json();
      if (!r.ok) {
        lastErr = (j.error && j.error.message) || `HTTP ${r.status}`;
        if (/not found|not supported|unsupported|unknown name|thinking|invalid argument/i.test(lastErr)) continue;
        return res.status(502).json({ error: lastErr });
      }
      const c = j.candidates && j.candidates[0];
      if (!c || !c.content) { lastErr = 'réponse vide'; continue; }
      const text = (c.content.parts || []).map(p => p.text || '').join('').trim();
      if (!text) { lastErr = 'réponse vide'; continue; }
      return res.status(200).json({ text, truncated: c.finishReason === 'MAX_TOKENS' });
    } catch (e) {
      lastErr = e.message;
    }
  }
  return res.status(502).json({ error: lastErr });
};
