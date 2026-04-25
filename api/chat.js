const WCA = 'https://www.worldcubeassociation.org/api/v0';

const EVENTS = {
  '333':'3x3x3','222':'2x2x2','444':'4x4x4','555':'5x5x5','666':'6x6x6','777':'7x7x7',
  '333bf':'3x3 Blind','333oh':'3x3 OH','333fm':'Fewest Moves','333mbf':'Multi-Blind',
  'pyram':'Pyraminx','skewb':'Skewb','sq1':'Square-1','minx':'Megaminx',
  'clock':'Clock','444bf':'4x4 Blind','555bf':'5x5 Blind'
};

const EVENT_ALIASES = {
  '333':['3x3','cube','rubik','trois'],
  '222':['2x2','deux'],
  '444':['4x4'],'555':['5x5'],'666':['6x6'],'777':['7x7'],
  '333bf':['blind','aveugle','bld'],
  '333oh':['one hand','oh','une main'],
  '333fm':['fewest','fmc'],
  '333mbf':['multi','mbld'],
  'pyram':['pyram','pyramide','pyraminx'],
  'skewb':['skewb'],
  'sq1':['square','sq1'],
  'minx':['mega','megaminx'],
  'clock':['clock','horloge'],
};

function fmt(cs, ev) {
  const n = parseInt(cs, 10);
  if (!n || isNaN(n) || n <= 0) return '—';
  if (n === -1) return 'DNF';
  if (n === -2) return 'DNS';
  if (ev === '333fm') return n + ' moves';
  if (ev === '333mbf') {
    const missed = n%100, t = Math.floor(n/100)%100000;
    const diff = 99-Math.floor(n/10000000), solved = diff+missed;
    return solved+'/'+(solved+missed)+' '+Math.floor(t/60)+':'+(t%60).toString().padStart(2,'0');
  }
  const tot=n*10, c=Math.floor((tot%1000)/10), s=Math.floor(tot/1000)%60, m=Math.floor(tot/60000);
  if (m>0) return m+':'+s.toString().padStart(2,'0')+'.'+c.toString().padStart(2,'0');
  return s+'.'+c.toString().padStart(2,'0');
}

function detectEvent(q) {
  for (const [code] of Object.entries(EVENTS)) {
    if (q.includes(code)) return code;
  }
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

// Récupère le WR via /rankings (le #1 mondial = le WR)
async function getWR(evId, type) {
  try {
    const d = await wcaGet('/rankings/' + evId + '/' + type + '?per_page=1');
    const list = d.results || (Array.isArray(d) ? d : null);
    if (!list || !list.length) return null;
    const r = list[0];
    const best = parseInt(r.best, 10);
    if (!best || best <= 0) return null;
    return {
      time: fmt(best, evId),
      name: r.name || r.person_name || '?',
      country: r.country_iso2 || r.country || '',
      wca_id: r.wca_id || '',
      competition: (r.competition_id || '').replace(/_/g,' ')
    };
  } catch(e) { return null; }
}

async function fetchWCAData(question) {
  const q = question.toLowerCase();
  const result = {};
  const evId = detectEvent(q);

  // RECORDS via /rankings (le #1 = WR)
  // On charge toujours au moins l'event détecté, ou les 5 principaux
  try {
    const eventsToFetch = evId ? [evId] : ['333','222','pyram','skewb','333oh'];
    const lines = [];
    for (const ev of eventsToFetch) {
      const evName = EVENTS[ev] || ev;
      const [single, avg] = await Promise.all([getWR(ev,'single'), getWR(ev,'average')]);
      if (single) lines.push(evName + ' WR Single: ' + single.time + ' — ' + single.name + ' (' + single.country + ') @ ' + single.competition);
      if (avg) lines.push(evName + ' WR Average: ' + avg.time + ' — ' + avg.name + ' (' + avg.country + ') @ ' + avg.competition);
    }
    if (lines.length) result.records = lines.join('\n');
  } catch(e) { console.log('records err:', e.message); }

  // PROFIL par WCA ID
  const idMatch = question.match(/\b(\d{4}[A-Z]{4}\d{2})\b/i);
  if (idMatch) {
    try {
      const d = await wcaGet('/persons/' + idMatch[1].toUpperCase());
      const p = d.person || d;
      const prs = p.personal_records || {};
      const lines = [(p.name||'?') + ' (' + (p.wca_id||idMatch[1]) + ') — ' + (p.country||'') + ' — ' + (p.competition_count||0) + ' compétitions'];
      for (const [ev, evd] of Object.entries(prs)) {
        const si = evd.single ? 'single ' + fmt(evd.single.best,ev) + ' (WR#' + (evd.single.world_rank||'?') + ' NR#' + (evd.single.national_rank||'?') + ')' : '';
        const av = evd.average ? 'avg ' + fmt(evd.average.best,ev) + ' (WR#' + (evd.average.world_rank||'?') + ')' : '';
        if (si||av) lines.push('  ' + (EVENTS[ev]||ev) + ': ' + [si,av].filter(Boolean).join(' | '));
      }
      result.profile = lines.join('\n');
    } catch(e) {}
  }

  // CLASSEMENT
  if (q.includes('france') || q.includes('français') || q.includes('classement') || q.includes('top ') || q.includes('monde')) {
    const ev = evId || '333';
    const type = (q.includes('average')||q.includes('moyenne')) ? 'average' : 'single';
    const region = (q.includes('monde')||q.includes('world')) ? 'world' : 'France';
    try {
      const d = await wcaGet('/rankings/' + ev + '/' + type + '?region=' + encodeURIComponent(region) + '&per_page=10');
      const list = d.results || (Array.isArray(d) ? d : []);
      if (list.length) {
        const lines = ['Top ' + (region==='world'?'Monde':'France') + ' ' + (EVENTS[ev]||ev) + ' ' + type + ':'];
        list.forEach((r,i) => lines.push('#'+(i+1)+' '+(r.name||'?')+' — '+fmt(parseInt(r.best,10),ev)+' ('+(r.country_iso2||r.country||'')+')'));
        result.rankings = lines.join('\n');
      }
    } catch(e) {}
  }

  // COMPÉTITIONS
  if (q.includes('compétition')||q.includes('competition')||q.includes('prochain')||q.includes('agenda')) {
    try {
      const today = new Date().toISOString().split('T')[0];
      const d = await wcaGet('/competitions?country_iso2=FR&start='+today+'&per_page=6');
      const list = d.competitions || (Array.isArray(d)?d:[]);
      if (list.length) result.competitions = 'Prochaines compétitions France:\n' + list.map(c => c.name+' — '+(c.city||'')+' — '+(c.start_date||'')).join('\n');
    } catch(e) {}
  }

  // RECHERCHE nom
  const nomMatch = q.match(/(?:profil|cherche|qui est|résultats de)\s+(?:de |d')?([a-zàâéèîïôùûç][a-zàâéèîïôùûç\s-]{2,30})/);
  if (nomMatch && !idMatch) {
    try {
      const d = await wcaGet('/persons?q='+encodeURIComponent(nomMatch[1].trim())+'&per_page=5');
      const persons = d.persons||[];
      if (persons.length) result.search = persons.map(p => p.name+' ('+p.wca_id+') — '+(p.country_iso2||'')+' — '+(p.competition_count||0)+' comps').join('\n');
    } catch(e) {}
  }

  // SPEEDCUBERS SUIVIS
  const suivis = ['2026OUCA01','2021ZAJD03','2023GENG02','2019WANY36','2016PILA03'];
  if (q.includes('calixte')||q.includes('suivi')||q.includes('ami')||suivis.some(id=>q.includes(id.toLowerCase()))) {
    const lines = [];
    for (const id of suivis) {
      try {
        const d = await wcaGet('/persons/'+id);
        const p = d.person||d;
        const prs = p.personal_records||{};
        lines.push((p.name||'?')+' ('+id+') — '+(p.country||'')+' — '+(p.competition_count||0)+' comps');
        for (const [ev,evd] of Object.entries(prs)) {
          if (evd.single) lines.push('  '+(EVENTS[ev]||ev)+': '+fmt(evd.single.best,ev)+' WR#'+(evd.single.world_rank||'?'));
        }
      } catch(e) {}
    }
    if (lines.length) result.suivis = lines.join('\n');
  }

  return result;
}

function buildPrompt(data) {
  let p = 'Tu es CubeTracker, assistant speedcubing de Calixte OU (WCA: 2026OUCA01).\n';
  p += 'Réponds en français, enthousiaste et concis. RÈGLE: utilise UNIQUEMENT les données ci-dessous.\n\n';
  if (data.records)      p += '=== RECORDS WCA ===\n' + data.records + '\n\n';
  if (data.profile)      p += '=== PROFIL ===\n' + data.profile + '\n\n';
  if (data.rankings)     p += '=== CLASSEMENT ===\n' + data.rankings + '\n\n';
  if (data.competitions) p += '=== ' + data.competitions + '\n\n';
  if (data.search)       p += '=== RECHERCHE ===\n' + data.search + '\n\n';
  if (data.suivis)       p += '=== SUIVIS ===\n' + data.suivis + '\n\n';
  return p;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({error:'Method not allowed'});
  const {question} = req.body;
  if (!question?.trim()) return res.status(400).json({error:'Question manquante'});
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({error:'Clé API Anthropic manquante dans Vercel'});

  try {
    const wcaData = await fetchWCAData(question);
    console.log('WCA fetched:', Object.keys(wcaData).join(', '));
    if (wcaData.records) console.log('Records:', wcaData.records.split('\n')[0]);

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method:'POST',
      headers:{'Content-Type':'application/json','x-api-key':apiKey,'anthropic-version':'2023-06-01'},
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 600,
        system: buildPrompt(wcaData),
        messages: [{role:'user', content:question}]
      })
    });

    if (!r.ok) { const e = await r.json(); throw new Error(e.error?.message||'Claude HTTP '+r.status); }
    const d = await r.json();
    res.status(200).json({answer: d.content?.[0]?.text || 'Pas de réponse.'});
  } catch(e) {
    console.error('Error:', e.message);
    res.status(500).json({error: e.message});
  }
}
