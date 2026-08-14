import './styles.css';

// Phase A scaffold boot shell.
//
// This file intentionally contains NO gameplay. The engine and the five
// modalities are ported in Phase A step 3, against the contract written into
// CANON.md — which cannot be written until ./legacy/index.html is available.
// See docs/PHASE-A-STATUS.md.

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('#app container missing from index.html');

app.innerHTML = `
  <main class="boot">
    <h1 class="boot__title">MODESHIFT</h1>
    <p class="boot__status" data-testid="boot-status">
      Scaffold online. Engine not yet ported.
    </p>
  </main>
`;

// e2e boot marker: proves the inlined bundle parsed and executed.
document.documentElement.dataset['appBooted'] = 'true';
