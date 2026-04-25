const WCA = 'https://www.worldcubeassociation.org/api/v0';

const EVENTS = {
  '333':'3x3x3','222':'2x2x2','444':'4x4x4','555':'5x5x5','666':'6x6x6','777':'7x7x7',
  '333bf':'3x3 Blind','333oh':'3x3 OH','333fm':'Fewest Moves','333mbf':'Multi-Blind',
  'pyram':'Pyraminx','skewb':'Skewb','sq1':'Square-1','minx':'Megaminx',
  'clock':'Clock','444bf':'4x4 Blind','555bf':'5x5 Blind'
};

// Noms alternatifs français/anglais pour détecter l'épreuve
const EVENT_ALIASES = {
  '333': ['3x3','3x3x3','trois','cube','rubik'],
  '222': ['2x2','2x2x2','deux'],
  '444': ['4x4','4x4x4'],
  '555': ['5x5','5x5x5'],
  '666': ['6x6','6x6x6'],
  '777': ['7x7','7x7x7'],
  '333bf': ['blind','blindfolded','aveugle','bld'],
  '333oh': ['one hand','one-hand','oh','une main'],
  '333fm': ['fewest','fmc','moves','mouvement'],
  '333mbf': ['multi','multiblind','mbld'],
  'pyram': ['pyram','pyramide','pyraminx'],
  'skewb': ['skewb'],
  'sq1': ['square','sq1','square-1'],
  'minx': ['mega','megaminx','minx'],
  'clock': ['clock','horloge'],
  '444bf': ['4x4 blind','4bld'],
  '555bf': ['5x5 blind','5bld'],
};

function fmt(cs, ev) {
  const n = parseInt(cs, 10);
  if (!n || isNaN(n) || n <= 0) return '—';
  if (n === -1) return 'DNF';
  if (n === -2) return 'DNS';
  if (ev === '333fm') return n + ' moves';
  if (ev === '333mbf') {
    const missed = n % 100, t = Math.floor(n/100)%100000;
    const diff = 99 - Math.floor(n/10000000), solved = diff + missed;
    return solved+'/'+(solved+missed)+' en '+Math.floor(t/60)+':'+(t%60).toString().padStart(2,'0');
  }
  const tot = n*10, c = Math.floor((tot%1000)/10), s = Math.floor(tot/1000)%60, m = Math.floor(tot/60000);
  if (m > 0) return m+':'+s.toString().padStart(2,'0')+'.'+c.toString().padStart(2,'0');
  return s+'.'+c.toString().padStart(2,'0');
}

function detectEvent(q) {
  // Cherche d'abord le code exact (333, 222, etc.)
  for (const [code] of Object.entries(EVENTS)) {
    if (q.includes(code)) return code;
  }
  // Puis les alias
  for (const [code, aliases] of Object.entries(EVENT_ALIASES)) {
    if (aliases.some(a => q.includes(a))) return code;
  }
  return null;
}

async function wcaGet(path) {
  const res = await fetch(WCA + path);
  if (!res.ok) throw new Error('WCA HTTP ' + res.status);
  return res.json();
}

async function fetchWCAData(question) {
  const q = question.toLowerCase();
  const result = {};

  // 1. RECORDS — chargés pour toute question (c'est léger, ~5KB)
  try {
    const evId = detectEvent(q);
    const path = evId ? '/records?event_id=' + evId : '/records';
    const data = await wcaGet(path);
    const wr = data.world_records || data;
    // Convertir en texte lisible directement
    const lines = [];
    for (const [ev, evd] of Object.entries(wr)) {
      if (!evd || typeof evd !== 'object') continue;
      const name = EVENTS[ev] || ev;
      if (evd.single) {
        const s = evd.single;
        const best = parseInt(s.best, 10);
        if (best > 0) lines.push(name + ' Single WR: ' + fmt(best,ev) + ' — ' + (s.name||s.person_name||'?') + ' (' + (s.country_iso2||s.country||'') + ') @ ' + (s.competition_id||'').replace(/_/g,' ') + (s.date ? ' · '+s.date : ''));
      }
      if (evd.average) {
        const a = evd.average;
        const best = parseInt(a.best, 10);
        if (best > 0) lines.push(name + ' Average WR: ' + fmt(best,ev) + ' — ' + (a.name||a.person_name||'?') + ' (' + (a.country_iso2||a.country||'') + ') @ ' + (a.competition_id||'').replace(/_/g,' ') + (a.date ? ' · '+a.date : ''));
      }
    }
    result.records = lines.length > 0 ? lines.join('\n') : null;
  } catch(e) {
    console.log('records error:', e.message);
  }

  // 2. PROFIL par WCA ID
  const idMatch = question.match(/\b(\d{4}[A-Z]{4}\d{2})\b/i);
  if (idMatch) {
    try {
      const d = await wcaGet('/persons/' + idMatch[1].toUpperCase());
      const p = d.person || d;
      const prs = p.personal_records || {};
      const lines = [p.name + ' (' + (p.wca_id||idMatch[1]) + ') — ' + (p.country||'') + ' — ' + (p.competition_count||0) + ' compétitions'];
      for (const [ev, evd] of Object.entries(prs)) {
        const evName = EVENTS[ev] || ev;
        const si = evd.single ? 'single ' + fmt(evd.single.best,ev) + ' (WR#' + (evd.single.world_rank||'?') + ' NR#' + (evd.single.national_rank||'?') + ')' : '';
        const av = evd.average ? 'avg ' + fmt(evd.average.best,ev) + ' (WR#' + (evd.average.world_rank||'?') + ')' : '';
        if (si || av) lines.push('  ' + evName + ': ' + [si,av].filter(Boolean).join(' | '));
      }
      result.profile = lines.join('\n');
    } catch(e) {}
  }

  // 3. RECHERCHE par nom
  const searchPat = q.match(/(?:profil|cherche|qui est|résultats de|show)\s+(?:de |d')?([a-zàâéèêëîïôùûç][a-zàâéèêëîïôùûç\s-]{2,30})/);
  if (searchPat && !idMatch) {
    try {
      const d = await wcaGet('/persons?q=' + encodeURIComponent(searchPat[1].trim()) + '&per_page=5');
      const persons = d.persons || [];
      if (persons.length) {
        result.search = persons.map(p => p.name + ' (' + p.wca_id + ') — ' + (p.country_iso2||'') + ' — ' + (p.competition_count||0) + ' comps').join('\n');
      }
    } catch(e) {}
  }

  // 4. CLASSEMENT France/région
  if (q.includes('france') || q.includes('français') || q.includes('classement') || q.includes('top ')) {
    const evId = detectEvent(q) || '333';
    const type = q.includes('average') || q.includes('avg') || q.includes('moyenne') ? 'average' : 'single';
    const region = q.includes('monde') || q.includes('world') ? 'world' : 'France';
    try {
      const d = await wcaGet('/rankings/' + evId + '/' + type + '?region=' + encodeURIComponent(region) + '&per_page=10');
      const list = d.results || d;
      if (Array.isArray(list) && list.length) {
        const evName = EVENTS[evId] || evId;
        const lines = ['Top ' + (region==='world'?'Monde':'France') + ' ' + evName + ' ' + type + ':'];
        list.slice(0,10).forEach((r,i) => {
          lines.push('#' + (i+1) + ' ' + (r.name||r.person_name||'?') + ' — ' + fmt(parseInt(r.best,10),evId) + ' (' + (r.country_iso2||r.country||'') + ')');
        });
        result.rankings = lines.join('\n');
      }
    } catch(e) {}
  }

  // 5. COMPÉTITIONS à venir
  if (q.includes('compétition') || q.includes('competition') || q.includes('prochain') || q.includes('agenda')) {
    try {
      const today = new Date().toISOString().split('T')[0];
      const d = await wcaGet('/competitions?country_iso2=FR&start=' + today + '&per_page=6');
      const list = d.competitions || d;
      if (Array.isArray(list) && list.length) {
        result.competitions = 'Prochaines compétitions France:\n' + list.map(c => c.name + ' — ' + (c.city||'') + ' — ' + (c.start_date||'')).join('\n');
      }
    } catch(e) {}
  }

  // 6. SPEEDCUBERS SUIVIS (Calixte + amis)
  const suivis = ['2026OUCA01','2021ZAJD03','2023GENG02','2019WANY36','2016PILA03'];
  const wantsSuivis = q.includes('calixte') || q.includes('mes amis') || q.includes('suivi') ||
    suivis.some(id => q.includes(id.toLowerCase()));
  if (wantsSuivis) {
    const lines = [];
    for (const id of suivis) {
      try {
        const d = await wcaGet('/persons/' + id);
        const p = d.person || d;
        const prs = p.personal_records || {};
        const evCount = Object.keys(prs).length;
        lines.push(p.name + ' (' + id + ') — ' + (p.country||'') + ' — ' + (p.competition_count||0) + ' comps — ' + evCount + ' épreuves');
        // Ajoute les meilleurs PR
        for (const [ev, evd] of Object.entries(prs)) {
          if (evd.single) lines.push('  ' + (EVENTS[ev]||ev) + ': ' + fmt(evd.single.best,ev) + ' (WR#' + (evd.single.world_rank||'?') + ')');
        }
      } catch(e) {}
    }
    if (lines.length) result.suivis = lines.join('\n');
  }

  return result;
}

function buildSystemPrompt(data) {
  let prompt = `Tu es CubeTracker, l'assistant speedcubing de Calixte OU (WCA: 2026OUCA01).
Réponds en français, de façon enthousiaste et concise, comme un ami passionné de speedcubing.

RÈGLE ABSOLUE: utilise UNIQUEMENT les données WCA ci-dessous.
Si une info n'est PAS dans les données, dis clairement: "Cette info n'est pas dans mes données WCA actuelles, vérifie sur worldcubeassociation.org"
NE JAMAIS inventer un temps, un nom ou un ranking.\n\n`;

  if (data.records) prompt += '=== RECORDS MONDIAUX WCA (officiel, temps réel) ===\n' + data.records + '\n\n';
  if (data.profile) prompt += '=== PROFIL COMPÉTITEUR ===\n' + data.profile + '\n\n';
  if (data.rankings) prompt += '=== CLASSEMENT ===\n' + data.rankings + '\n\n';
  if (data.competitions) prompt += '=== ' + data.competitions + '\n\n';
  if (data.search) prompt += '=== RÉSULTATS RECHERCHE ===\n' + data.search + '\n\n';
  if (data.suivis) prompt += '=== SPEEDCUBERS SUIVIS PAR CALIXTE ===\n' + data.suivis + '\n\n';

  return prompt;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { question } = req.body;
  if (!question?.trim()) return res.status(400).json({ error: 'Question manquante' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Clé API Anthropic manquante dans Vercel (Settings → Environment Variables)' });

  try {
    const wcaData = await fetchWCAData(question);
    const systemPrompt = buildSystemPrompt(wcaData);

    console.log('WCA data fetched:', Object.keys(wcaData).join(', '));
    if (wcaData.records) console.log('Records preview:', wcaData.records.split('\n')[0]);

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 800,
        system: systemPrompt,
        messages: [{ role: 'user', content: question }]
      })
    });

    if (!r.ok) {
      const err = await r.json();
      throw new Error(err.error?.message || 'Claude HTTP ' + r.status);
    }

    const d = await r.json();
    res.status(200).json({ answer: d.content?.[0]?.text || 'Pas de réponse.' });

  } catch(e) {
    console.error('CubeTracker error:', e.message);
    res.status(500).json({ error: e.message });
  }
}
