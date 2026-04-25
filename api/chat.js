const WCA_BASE = 'https://www.worldcubeassociation.org/api/v0';

const EVENT_NAMES = {
  '333':'3x3x3','222':'2x2x2','444':'4x4x4','555':'5x5x5','666':'6x6x6','777':'7x7x7',
  '333bf':'3x3 Blindfolded','333oh':'3x3 One-Handed','333fm':'Fewest Moves',
  '333mbf':'Multi-Blind','pyram':'Pyraminx','skewb':'Skewb','sq1':'Square-1',
  'minx':'Megaminx','clock':'Clock','444bf':'4x4 Blindfolded','555bf':'5x5 Blindfolded'
};

function formatTime(cs, eventId) {
  if (cs === -1) return 'DNF';
  if (cs === -2) return 'DNS';
  if (cs === 0) return '—';
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
  const prs = (person) => {
    if (!person?.personal_records) return '';
    return Object.entries(person.personal_records).map(([ev, d]) => {
      const s = d.single ? `single: ${formatTime(d.single.best, ev)} (WR #${d.single.world_rank}, NR #${d.single.national_rank})` : '';
      const a = d.average ? `avg: ${formatTime(d.average.best, ev)} (WR #${d.average.world_rank})` : '';
      return `  ${EVENT_NAMES[ev]||ev}: ${[s,a].filter(Boolean).join(' | ')}`;
    }).join('\n');
  };

  let context = `Tu es CubeTracker, l'assistant speedcubing de Calixte OU (WCA ID: 2026OUCA01).
Tu réponds en français, de façon concise et enthousiaste, comme un ami passionné de speedcubing.
Tu utilises UNIQUEMENT les données WCA fournies ci-dessous — jamais tes connaissances internes pour les temps ou rankings (risque d'hallucination).
Si une info n'est pas dans les données, dis-le clairement et suggère de reformuler.

SPEEDCUBERS SUIVIS PAR CALIXTE:
- Calixte OU : 2026OUCA01
- 2021ZAJD03
- 2023GENG02  
- 2019WANY36
- 2016PILA03

DONNÉES WCA EN TEMPS RÉEL:\n`;

  if (wcaData.person) {
    const p = wcaData.person.person || wcaData.person;
    context += `\nPROFIL: ${p.name} (${p.wca_id}) — ${p.country} — ${p.competition_count} compétitions\nPR:\n${prs(p)}\n`;
  }
  if (wcaData.followedPersons?.length) {
    wcaData.followedPersons.forEach(fp => {
      const p = fp.person || fp;
      context += `\nPROFIL SUIVI: ${p.name} (${p.wca_id}) — ${p.country}\nPR:\n${prs(p)}\n`;
    });
  }
  if (wcaData.records) {
    const wr = wcaData.records.world_records || {};
    const evId = wcaData.recordEvent;
    if (evId && wr[evId]) {
      const s = wr[evId].single;
      const a = wr[evId].average;
      context += `\nRECORDS ${EVENT_NAMES[evId]||evId}:`;
      if (s) context += `\n  WR Single: ${formatTime(s.best,evId)} par ${s.name} (${s.country_iso2||''}) — ${s.competition_id} ${s.date||''}`;
      if (a) context += `\n  WR Average: ${formatTime(a.best,evId)} par ${a.name} (${a.country_iso2||''}) — ${a.competition_id} ${a.date||''}`;
      context += '\n';
    } else {
      const top3 = Object.entries(wr).slice(0,3);
      top3.forEach(([ev, d]) => {
        if (d.single) context += `\n  WR ${EVENT_NAMES[ev]||ev} Single: ${formatTime(d.single.best,ev)} par ${d.single.name}`;
      });
      context += '\n';
    }
  }
  if (wcaData.franceRankings) {
    const ev = wcaData.franceEvent || '333';
    const results = wcaData.franceRankings.results || wcaData.franceRankings;
    if (Array.isArray(results)) {
      context += `\nTOP FRANCE ${EVENT_NAMES[ev]||ev} SINGLE:\n`;
      results.slice(0,10).forEach((r,i) => {
        context += `  #${i+1} ${r.name||r.person_name} — ${formatTime(r.best,ev)}\n`;
      });
    }
  }
  if (wcaData.upcomingComps) {
    const comps = wcaData.upcomingComps.competitions || wcaData.upcomingComps;
    if (Array.isArray(comps)) {
      context += `\nPROCHAINES COMPÉTITIONS FRANCE:\n`;
      comps.slice(0,5).forEach(c => {
        context += `  ${c.name} — ${c.city} — ${c.start_date} → ${c.end_date}\n`;
      });
    }
  }
  if (wcaData.searchResults) {
    const persons = wcaData.searchResults.persons || [];
    context += `\nRÉSULTATS RECHERCHE:\n`;
    persons.forEach(p => {
      context += `  ${p.name} (${p.wca_id}) — ${p.country_iso2} — ${p.competition_count} compétitions\n`;
    });
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
        model: 'claude-sonnet-4-5-20251022',
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
