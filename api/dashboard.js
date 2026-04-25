const WCA_BASE = 'https://www.worldcubeassociation.org/api/v0';
const FOLLOWED_IDS = ['2026OUCA01','2021ZAJD03','2023GENG02','2019WANY36','2016PILA03'];

async function wcaFetch(path) {
  const res = await fetch(`${WCA_BASE}${path}`);
  if (!res.ok) throw new Error(`WCA ${res.status}`);
  return res.json();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).end();

  try {
    const [recordsRes, ...personsRes] = await Promise.allSettled([
      wcaFetch('/records'),
      ...FOLLOWED_IDS.map(id => wcaFetch(`/persons/${id}`))
    ]);

    const records = recordsRes.status === 'fulfilled' ? recordsRes.value : null;
    const persons = personsRes.map((r, i) => ({
      id: FOLLOWED_IDS[i],
      data: r.status === 'fulfilled' ? (r.value.person || r.value) : null,
      error: r.status === 'rejected' ? r.reason?.message : null
    }));

    res.status(200).json({ records, persons, fetchedAt: new Date().toISOString() });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
}
