# CubeTracker 🎲

Dashboard WCA + Chatbot Claude pour Calixte.

## Structure du projet

```
cubetracker/
├── index.html          ← Le site complet (dashboard + chatbot)
├── api/
│   ├── chat.js         ← Fonction Vercel : reçoit question → appelle WCA → appelle Claude
│   └── dashboard.js    ← Fonction Vercel : données dashboard au chargement
├── vercel.json         ← Config Vercel
├── package.json        ← Config Node
└── README.md           ← Ce fichier
```

## Déploiement sur Vercel (15 minutes)

### Étape 1 — Mettre le code sur GitHub
1. Va sur github.com → "New repository" → nom : `cubetracker` → Public → Create
2. Sur la page du repo, clique "uploading an existing file"
3. Glisse-dépose TOUS les fichiers (index.html, vercel.json, package.json, README.md)
4. Crée le dossier `api/` en uploadant les fichiers dedans
5. Commit changes

### Étape 2 — Connecter à Vercel
1. Va sur vercel.com → "Add New Project"
2. Importe ton repo GitHub `cubetracker`
3. Clique "Deploy" (sans rien changer)

### Étape 3 — Obtenir ta clé API Anthropic
1. Va sur console.anthropic.com
2. Crée un compte (gratuit)
3. API Keys → "Create Key" → copie la clé (commence par `sk-ant-...`)
4. Ajoute des crédits : $5 suffisent pour des milliers de questions

### Étape 4 — Ajouter la clé dans Vercel
1. Dans Vercel → ton projet → Settings → Environment Variables
2. Name : `ANTHROPIC_API_KEY`
3. Value : ta clé `sk-ant-...`
4. Save → Redeploy

### C'est tout ! Calixte peut utiliser le site depuis son téléphone.

## Ajouter des speedcubers suivis

Dans `index.html`, ligne :
```js
const FRIENDS = ['2021ZAJD03','2023GENG02','2019WANY36','2016PILA03'];
```
Ajoute les nouveaux WCA IDs dans le tableau, re-déploie.

## Coût estimé
- Vercel : gratuit (100k requêtes/mois)
- Claude API : ~$0.003 par question (claude-sonnet-4)
- 100 questions/jour = ~$0.30/mois
