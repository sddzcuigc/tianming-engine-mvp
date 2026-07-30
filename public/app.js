import { DECISIONS, INITIAL_STATE, resolveDecision } from './rules.js';

let state = { ...INITIAL_STATE };
let selectedId = null;
let resolved = false;

const stateGrid = document.querySelector('#state-grid');
const decisionGrid = document.querySelector('#decision-grid');
const issueButton = document.querySelector('#issue-order');
const resetButton = document.querySelector('#reset');
const resultPanel = document.querySelector('#result-panel');
const provenanceLabel = document.querySelector('#build-provenance');

const stateLabels = {
  treasury: ['国库', '万贯'],
  coalSupply: ['煤炭供应', '点'],
  publicTrust: ['民心', '点'],
  knowledge: ['已知情报', '项']
};

function renderState() {
  stateGrid.innerHTML = Object.entries(stateLabels).map(([key, [label, unit]]) => `
    <article class="metric">
      <span>${label}</span>
      <strong>${state[key]}</strong>
      <small>${unit}</small>
    </article>
  `).join('');
  document.querySelector('#turn-label').textContent = `第 ${state.turn} 回合`;
}

function renderDecisions() {
  decisionGrid.innerHTML = DECISIONS.map((decision) => `
    <button class="decision ${selectedId === decision.id ? 'selected' : ''}" data-id="${decision.id}" ${resolved ? 'disabled' : ''}>
      <span class="decision-meta"><b>${decision.advisor}</b><em>${decision.stance}</em></span>
      <strong>${decision.title}</strong>
      <p>${decision.summary}</p>
      <span class="effects">国库 ${signed(decision.effects.treasury)} · 煤炭 ${signed(decision.effects.coalSupply)} · 民心 ${signed(decision.effects.publicTrust)}</span>
    </button>
  `).join('');

  for (const button of decisionGrid.querySelectorAll('.decision')) {
    button.addEventListener('click', () => {
      selectedId = button.dataset.id;
      issueButton.disabled = false;
      renderDecisions();
    });
  }
}

function signed(value) {
  return value > 0 ? `+${value}` : String(value);
}

async function renderBuildProvenance() {
  try {
    const response = await fetch('./build-info.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const info = await response.json();
    const shortCommit = info.sourceCommit === 'unknown' ? 'unknown' : info.sourceCommit.slice(0, 12);
    provenanceLabel.textContent = `构建来源：${info.sourceBranch} @ ${shortCommit}`;
    provenanceLabel.title = `完整提交：${info.sourceCommit}；构建时间：${info.builtAt}`;
  } catch (error) {
    provenanceLabel.textContent = '构建来源：无法校验';
    provenanceLabel.title = String(error);
  }
}

issueButton.addEventListener('click', () => {
  if (!selectedId || resolved) return;
  const outcome = resolveDecision(state, selectedId);
  state = outcome.nextState;
  resolved = true;
  issueButton.disabled = true;
  resultPanel.hidden = false;
  resultPanel.innerHTML = `
    <div class="result-heading">
      <span>工程令已执行</span>
      <strong>${outcome.decision.title}</strong>
    </div>
    <p>${outcome.result}</p>
    <h3>规则审计</h3>
    <ol>${outcome.audit.map((line) => `<li>${line}</li>`).join('')}</ol>
  `;
  renderState();
  renderDecisions();
});

resetButton.addEventListener('click', () => {
  state = { ...INITIAL_STATE };
  selectedId = null;
  resolved = false;
  resultPanel.hidden = true;
  resultPanel.innerHTML = '';
  issueButton.disabled = true;
  renderState();
  renderDecisions();
});

renderState();
renderDecisions();
renderBuildProvenance();
