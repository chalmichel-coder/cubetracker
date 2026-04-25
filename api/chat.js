const WCA_BASE = 'https://www.worldcubeassociation.org/api/v0';

const EVENT_NAMES = {
  '333':'3x3x3','222':'2x2x2','444':'4x4x4','555':'5x5x5','666':'6x6x6','777':'7x7x7',
  '333bf':'3x3 Blind','333oh':'3x3 OH','333fm':'Fewest Moves','333mbf':'Multi-Blind',
  'pyram':'Pyraminx','skewb':'Skewb','sq1':'Square-1','minx':'Megaminx',
  'clock':'Clock','444bf':'4x4 Blind','555bf':'5x5 Blind'
};

function fmt(cs, ev) {
  const n = parseInt(cs, 10);
  if (!n || isNaN(n) || n <= 0) return '?';
  if (n === -1) return 'DNF';
  if (n === -2) return 'DNS';
  if (ev === '333fm') return `${n} moves`;
  if (ev === '333mbf') {
    const missed = n % 100;
    const t = Math.floor(n / 100) % 100000;
    const diff = 99 - Math.floor(n / 10000000);
    const solved = diff + missed;
    return `${solved}/${solved+missed} en ${Math.floor(t/60)}:${(t%60).toString().padStart(2,'0')}`;
  }
  const tot = n * 10;
  const c = Math.floor((tot % 1000) / 10);
  const s = Math.floor(tot / 1000) % 60;
  const m = Math.floor(tot / 60000);
  if (m > 0) return `${m}:${s.toString().padStart(2,'0')}.${c.toString().padStart(2,'0')}`;
  return `${s}.${c.toString().padStart(2,'0')}`;
}

async function wcaFetch(path) {
  const res = await fetch(`${WCA_BASE}${path}`);
  if (!res.ok) throw new Error(`WCA ${res.status}`);
  return res.json();
}

function isAboutRecords(q) {
  const keywords = ['record','wr','world','meilleur','actuel','3x3','2x2','4x4','5x5','6x6','7x7',
    '333','222','444','555','666','777','pyraminx','pyram','skewb','megaminx','minx',
    'square','sq1','clock','blindfolded','blind','oh','one hand','fewest','multi'];
  return keywords.some(k => q.includes(k));
}

async function gatherWCAData(question) {
  const q = question.toLowerCase();
  const data = {};

  // Toujours chercher les records si la question touche au speedcubing
  if (isAboutRecords(q)) {
    const evMatch = Object.keys(EVENT_NAMES).find(e => q.includes(e));
    try {
      const url = evMatch ? `/records?event_id=${evMatch}` : '/records';
      data.records = await wcaFetch(url);
      data.recordEvent = evMatch || null;
      console.log('RECORDS_OK keys:', Object.keys(data.records.world_records || data.records).slice(0,5).join(','));
    } catch(e) { console.log('records_err:', e.message); }
  }

  // WCA ID dans la question
  const idMatch = question.match(/\b(\d{4}[A-Z]{4}\d{2})\b/i);
  if (idMatch) {
    try {
      const r = await wcaFetch(`/persons/${idMatch[1].toUpperCase()}`);
      data.person = r.person || r;
    } catch(e) {}
  }

  // Recherche par nom
  const nomMatch = q.match(/(?:profil|résultats|cherche|qui est)\s+(?:de |d')?([a-zàâéèêëîïôùûüç\s-]+)/);
  if (nomMatch && !idMatch) {
    const nom = nomMatch[1].trim();
    if (nom.length > 2) {
      try { data.searchResults = await wcaFetch(`/persons?q=${encodeURIComponent(nom)}&per_page=5`); } catch(e) {}
    }
  }

  // Classement France
  if (q.includes('france') || q.includes('français') || q.includes('classement')) {
    const evMatch = Object.keys(EVENT_NAMES).find(e => q.includes(e)) || '333';
    try {
      data.franceRankings = await wcaFetch(`/rankings/${evMatch}/single?region=France&per_page=10`);
      data.franceEvent = evMatch;
    } catch(e) {}
  }

  // Compétitions à venir
  if (q.includes('compétition') || q.includes('competition') || q.includes('prochain') || q.includes('agenda') || q.includes('quand')) {
    try {
      const today = new Date().toISOString().split('T')[0];
      data.upcomingComps = await wcaFetch(`/competitions?country_iso2=FR&start=${today}&per_page=6`);
    } catch(e) {}
  }

  // Speedcubers suivis
  const suivis = ['2026OUCA01','2021ZAJD03','2023GENG02','2019WANY36','2016PILA03'];
  if (q.includes('calixte') || q.includes('suivi') || q.includes('ami') || q.includes('copain') ||
      suivis.some(id => q.includes(id.toLowerCase()))) {
    data.followedPersons = [];
    for (const id of suivis) {
      try {
        const r = await wcaFetch(`/persons/${id}`);
        data.followedPersons.push(r.person || r);
      } catch(e) {}
    }
  }

  return data;
}

function formatPerson(p) {
  if (!p) return '';
  let s = `${p.name||'?'} (${p.wca_id||'?'}) — ${p.country||''} — ${p.competition_count||0} compétitions\n`;
  const prs = p.personal_records || {};
  for (const [ev, d] of Object.entries(prs)) {
    const evName = EVENT_NAMES[ev] || ev;
    const si = d.single ? `single: ${fmt(d.single.best,ev)} (WR#${d.single.world_rank||'?'} NR#${d.single.national_rank||'?'})` : '';
    const av = d.average ? `avg: ${fmt(d.average.best,ev)} (WR#${d.average.world_rank||'?'})` : '';
    if (si || av) s += `  ${evName}: ${[si,av].filter(Boolean).join(' | ')}\n`;
  }
  return s;
}

function buildPrompt(wcaData) {
  let ctx = `Tu es CubeTracker, l'assistant speedcubing de Calixte OU (WCA ID: 2026OUCA01).
Réponds en français, de façon enthousiaste et concise.

RÈGLE ABSOLUE : tu utilises UNIQUEMENT les données WCA fournies ci-dessous.
Si une donnée n'est pas dans ces données, réponds : "Je ne trouve pas cette donnée dans l'API WCA en ce moment. Vérifie sur worldcubeassociation.org"
NE JAMAIS inventer un temps, un nom, ou un ranking. JAMAIS.\n\n`;

  // RECORDS
  if (wcaData.records) {
    const wr = wcaData.records.world_records || wcaData.records;
    ctx += '=== RECORDS MONDIAUX WCA (données officielles temps réel) ===\n';
    let count = 0;
    for (const [evId, evData] of Object.entries(wr)) {
      if (typeof evData !== 'object' || !evData) continue;
      const evName = EVENT_NAMES[evId] || evId;
      if (evData.single) {
        const s = evData.single;
        const best = parseInt(s.best, 10);
        const name = s.name || s.person_name || '?';
        const country = s.country_iso2 || s.country || '';
        const comp = (s.competition_id || '').replace(/_/g,' ');
        const date = s.date || '';
        if (best > 0) {
          ctx += `${evName} Single WR: ${fmt(best,evId)} par ${name} (${country}) @ ${comp} ${date}\n`;
          count++;
        }
      }
      if (evData.average) {
        const a = evData.average;
        const best = parseInt(a.best, 10);
        const name = a.name || a.person_name || '?';
        const country = a.country_iso2 || a.country || '';
        const comp = (a.competition_id || '').replace(/_/g,' ');
        const date = a.date || '';
        if (best > 0) {
          ctx += `${evName} Average WR: ${fmt(best,evId)} par ${name} (${country}) @ ${comp} ${date}\n`;
          count++;
        }
      }
    }
    ctx += count === 0 ? '(Aucun record disponible dans la réponse API)\n' : '';
    ctx += '\n';
  }

  if (wcaData.person) ctx += '=== PROFIL ===\n' + formatPerson(wcaData.person) + '\n';

  if (wcaData.followedPersons?.length) {
    ctx += '=== SPEEDCUBERS SUIVIS PAR CALIXTE ===\n';
    wcaData.followedPersons.forEach(p => { ctx += formatPerson(p); });
    ctx += '\n';
  }

  if (wcaData.franceRankings) {
    const evId = wcaData.franceEvent || '333';
    const list = wcaData.franceRankings.results || wcaData.franceRankings;
    if (Array.isArray(list) && list.length) {
      ctx += `=== TOP FRANCE ${EVENT_NAMES[evId]||evId} ===\n`;
      list.slice(0,10).forEach((r,i) => {
        ctx += `#${i+1} ${r.name||r.person_name||'?'} — ${fmt(parseInt(r.best,10), evId)}\n`;
      });
      ctx += '\n';
    }
  }

  if (wcaData.upcomingComps) {
    const list = wcaData.upcomingComps.competitions || wcaData.upcomingComps;
    if (Array.isArray(list) && list.length) {
      ctx += '=== PROCHAINES COMPÉTITIONS FRANCE ===\n';
      list.forEach(c => { ctx += `${c.name} — ${c.city||''} — ${c.start_date||''} → ${c.end_date||''}\n`; });
      ctx += '\n';
    }
  }

  if (wcaData.searchResults) {
    const list = wcaData.searchResults.persons || [];
    if (list.length) {
      ctx += '=== RÉSULTATS RECHERCHE ===\n';
      list.forEach(p => { ctx += `${p.name} (${p.wca_id}) — ${p.country_iso2||''} — ${p.competition_count||0} compétitions\n`; });
    }
  }

  return ctx;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { question } = req.body;
  if (!question) return res.status(400).json({ error: 'Question manquante' });
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Clé API Anthropic manquante' });

  try {
    const wcaData = await gatherWCAData(question);
    const systemPrompt = buildPrompt(wcaData);

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
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

    if (!claudeRes.ok) {
      const err = await claudeRes.json();
      throw new Error(err.error?.message || `Claude HTTP ${claudeRes.status}`);
    }

    const claudeData = await claudeRes.json();
    res.status(200).json({ answer: claudeData.content?.[0]?.text || 'Pas de réponse.' });

  } catch(e) {
    console.error('CubeTracker error:', e.message);
    res.status(500).json({ error: e.message });
  }
}
