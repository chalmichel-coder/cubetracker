const WCA_BASE = 'https://www.worldcubeassociation.org/api/v0';

const EVENT_NAMES = {
  '333':'3x3x3','222':'2x2x2','444':'4x4x4','555':'5x5x5','666':'6x6x6','777':'7x7x7',
  '333bf':'3x3 Blindfolded','333oh':'3x3 One-Handed','333fm':'Fewest Moves',
  '333mbf':'Multi-Blind','pyram':'Pyraminx','skewb':'Skewb','sq1':'Square-1',
  'minx':'Megaminx','clock':'Clock','444bf':'4x4 Blindfolded','555bf':'5x5 Blindfolded'
};

function formatTime(cs, eventId) {
  cs = parseInt(cs, 10);
  if (isNaN(cs) || cs === 0) return '—';
  if (cs === -1) return 'DNF';
  if (cs === -2) return 'DNS';
  if (eventId === '333fm') return `${cs} moves`;
  if (eventId === '333mbf') {
    const missed = cs % 100;
    const t = Math.floor(cs / 100) % 100000;
    const diff = 99 - Math.floor(cs / 10000000);
    const solved = diff + missed;
    return `${solved}/${solved + missed} en ${Math.floor(t/60)}:${(t%60).toString().padStart(2,'0')}`;
  }
  const tot = cs * 10;
  const c = Math.floor((tot % 1000) / 10);
  const s = Math.floor(tot / 1000) % 60;
  const m = Math.floor(tot / 60000);
  if (m > 0) return `${m}:${s.toString().padStart(2,'0')}.${c.toString().padStart(2,'0')}`;
  return `${s}.${c.toString().padStart(2,'0')}`;
}

async function wcaFetch(path) {
  const res = await fetch(`${WCA_BASE}${path}`);
  if (!res.ok) throw new Error(`WCA API error ${res.status} for ${path}`);
  return res.json();
}

// Detect intent and fetch relevant WCA data
async function gatherWCAData(question) {
  const q = question.toLowerCase();
  const data = {};

  // WCA ID pattern
  const wcaIdMatch = question.match(/\b(\d{4}[A-Z]{4}\d{2})\b/i);
  if (wcaIdMatch) {
    const id = wcaIdMatch[1].toUpperCase();
    try {
      const person = await wcaFetch(`/persons/${id}`);
      data.person = person;
    } catch(e) { data.personError = e.message; }
  }

  // Name search
  const nameSearch = q.match(/profil(?:e)? (?:de |d')?(.+)|résultats (?:de |d')?(.+)|qui est (.+)|cherche (.+)/);
  if (nameSearch && !wcaIdMatch) {
    const name = (nameSearch[1]||nameSearch[2]||nameSearch[3]||nameSearch[4]).trim();
    try {
      const res = await wcaFetch(`/persons?q=${encodeURIComponent(name)}&per_page=5`);
      data.searchResults = res;
    } catch(e) {}
  }

  // Records
  if (q.includes('record') || q.includes('wr') || q.includes('world record') || q.includes('meilleur temps')) {
    const eventMatch = Object.keys(EVENT_NAMES).find(e => q.includes(e));
    try {
      const rec = await wcaFetch(`/records${eventMatch ? `?event_id=${eventMatch}` : ''}`);
      data.records = rec;
      if (eventMatch) data.recordEvent = eventMatch;
    } catch(e) {}
  }

  // Rankings France
  if (q.includes('france') || q.includes('français') || q.includes('classement france')) {
    const eventMatch = Object.keys(EVENT_NAMES).find(e => q.includes(e)) || '333';
    try {
      const rank = await wcaFetch(`/rankings/${eventMatch}/single?region=France&per_page=10`);
      data.franceRankings = rank;
      data.franceEvent = eventMatch;
    } catch(e) {}
  }

  // Upcoming competitions France
  if (q.includes('compétition') || q.includes('competition') || q.includes('prochain') || q.includes('quand')) {
    try {
      const today = new Date().toISOString().split('T')[0];
      const comps = await wcaFetch(`/competitions?country_iso2=FR&start=${today}&per_page=5`);
      data.upcomingComps = comps;
    } catch(e) {}
  }

  // Preconfigured followed cubers — always fetch for context
  const followedIds = ['2026OUCA01','2021ZAJD03','2023GENG02','2019WANY36','2016PILA03'];
  for (const id of followedIds) {
    if (q.includes(id.toLowerCase()) || q.includes('calixte') || q.includes('suivi') || q.includes('ami')) {
      try {
        const p = await wcaFetch(`/persons/${id}`);
        if (!data.followedPersons) data.followedPersons = [];
        data.followedPersons.push(p);
      } catch(e) {}
    }
  }

  return data;
}

function buildSystemPrompt(wcaData) {
  const safeTime = (val, ev) => {
    const cs = parseInt(val, 10);
    if (!cs || isNaN(cs) || cs <= 0) return '—';
    return formatTime(cs, ev);
  };

  const getName = (r) => r?.name || r?.person_name || r?.wca_id || '?';
  const getCountry = (r) => r?.country_iso2 || r?.country || '';
  const getComp = (r) => (r?.competition_id || '').replace(/_/g,' ');
  const getBest = (r) => parseInt(r?.best, 10) || 0;

  let context = `Tu es CubeTracker, l'assistant speedcubing de Calixte OU (WCA ID: 2026OUCA01).
Tu réponds en français, de façon concise et enthousiaste, comme un ami passionné de speedcubing.
Tu utilises UNIQUEMENT les données WCA fournies ci-dessous — jamais tes connaissances internes pour les temps ou rankings.
Si une info manque, dis-le clairement.\n\n`;

  // RECORDS
  if (wcaData.records) {
    const wr = wcaData.records?.world_records || wcaData.records || {};
    context += 'RECORDS MONDIAUX ACTUELS:\n';
    for (const [ev, evData] of Object.entries(wr)) {
      const s = evData?.single;
      const a = evData?.average;
      const evName = EVENT_NAMES[ev] || ev;
      if (s && getBest(s) > 0) {
        context += `  ${evName} Single WR: ${safeTime(getBest(s), ev)} par ${getName(s)} (${getCountry(s)}) — ${getComp(s)}\n`;
      }
      if (a && getBest(a) > 0) {
        context += `  ${evName} Average WR: ${safeTime(getBest(a), ev)} par ${getName(a)} (${getCountry(a)}) — ${getComp(a)}\n`;
      }
    }
  }

  // PERSONS
  const addPerson = (fp) => {
    const p = fp?.person || fp;
    if (!p?.name) return;
    context += `\nPROFIL: ${p.name} (${p.wca_id||''}) — ${p.country||''} — ${p.competition_count||0} compétitions\n`;
    const prs = p.personal_records || {};
    for (const [ev, d] of Object.entries(prs)) {
      const s = d?.single, a = d?.average;
      if (!s) continue;
      const evName = EVENT_NAMES[ev] || ev;
      context += `  ${evName}: single ${safeTime(s.best,ev)} (WR#${s.world_rank||'?'} NR#${s.national_rank||'?'})`;
      if (a) context += ` | avg ${safeTime(a.best,ev)} (WR#${a.world_rank||'?'})`;
      context += '\n';
    }
  };

  if (wcaData.person) addPerson(wcaData.person);
  if (wcaData.followedPersons?.length) wcaData.followedPersons.forEach(addPerson);

  // RANKINGS FRANCE
  if (wcaData.franceRankings) {
    const ev = wcaData.franceEvent || '333';
    const results = wcaData.franceRankings?.results || wcaData.franceRankings || [];
    if (Array.isArray(results) && results.length) {
      context += `\nTOP FRANCE ${EVENT_NAMES[ev]||ev}:\n`;
      results.slice(0,10).forEach((r,i) => {
        context += `  #${i+1} ${getName(r)} — ${safeTime(getBest(r),ev)}\n`;
      });
    }
  }

  // COMPETITIONS
  if (wcaData.upcomingComps) {
    const comps = wcaData.upcomingComps?.competitions || wcaData.upcomingComps || [];
    if (Array.isArray(comps) && comps.length) {
      context += '\nPROCHAINES COMPÉTITIONS FRANCE:\n';
      comps.slice(0,5).forEach(c => {
        context += `  ${c.name} — ${c.city||''} — ${c.start_date||''}\n`;
      });
    }
  }

  // SEARCH
  if (wcaData.searchResults) {
    const persons = wcaData.searchResults?.persons || [];
    if (persons.length) {
      context += '\nRÉSULTATS RECHERCHE:\n';
      persons.forEach(p => {
        context += `  ${p.name} (${p.wca_id}) — ${p.country_iso2||''} — ${p.competition_count||0} compétitions\n`;
      });
    }
  }

  return context;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { question } = req.body;
  if (!question) return res.status(400).json({ error: 'Question manquante' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Clé API Anthropic manquante' });

  try {
    // Step 1: gather real WCA data
    const wcaData = await gatherWCAData(question);

    // Step 2: ask Claude with real data as context
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 1000,
        system: buildSystemPrompt(wcaData),
        messages: [{ role: 'user', content: question }]
      })
    });

    if (!claudeRes.ok) {
      const err = await claudeRes.json();
      throw new Error(err.error?.message || 'Claude API error');
    }

    const claudeData = await claudeRes.json();
    const answer = claudeData.content?.[0]?.text || 'Pas de réponse';

    res.status(200).json({ answer, wcaDataFetched: Object.keys(wcaData) });

  } catch(e) {
    res.status(500).json({ error: e.message });
  }
}
