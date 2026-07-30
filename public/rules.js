export const INITIAL_STATE = Object.freeze({
  treasury: 100,
  coalSupply: 60,
  publicTrust: 72,
  knowledge: 0,
  turn: 1
});

export const DECISIONS = Object.freeze([
  {
    id: 'investigate',
    advisor: '御史台',
    title: '先调查，再维持人工排水',
    stance: '稳健',
    summary: '拨小额资金维持矿井，同时测量涌水、泵效和锅炉材料。',
    effects: { treasury: -10, coalSupply: -4, publicTrust: 2, knowledge: 3 },
    audit: [
      '财政支出 10：支付人工排水与测量费用。',
      '煤炭供应下降 4：调查期内产能仍受涌水影响。',
      '认知增加 3：下一回合可识别水利与制造两类瓶颈。'
    ],
    result: '你没有立即获得神奇机器，但取得了会改变后续路线的可靠数据。'
  },
  {
    id: 'prototype',
    advisor: '学政',
    title: '直接试制低压蒸汽泵',
    stance: '激进',
    summary: '集中工匠与铁料，跳过调查，立即尝试制造第一台蒸汽泵。',
    effects: { treasury: -28, coalSupply: 3, publicTrust: -6, knowledge: 1 },
    audit: [
      '财政支出 28：征调铁料、锅炉与优秀工匠。',
      '煤炭供应短暂增加 3：临时样机带来有限排水。',
      '民心下降 6：地方工坊被抽走骨干，且缸体漏气。',
      '认知增加 1：失败暴露了圆柱标准化与密封瓶颈。'
    ],
    result: '样机短暂运转后漏气停机。失败不是随机惩罚，而是前置制造能力不足。'
  },
  {
    id: 'ration',
    advisor: '户部',
    title: '暂停铁工场，优先保财政',
    stance: '保守',
    summary: '减少煤炭消耗，延后军械交付，以财政安全换取喘息时间。',
    effects: { treasury: 6, coalSupply: 8, publicTrust: -10, knowledge: 0 },
    audit: [
      '财政增加 6：暂停铁工场减少运营支出。',
      '煤炭供应增加 8：需求下降而非产能恢复。',
      '民心下降 10：铁工、军械部门与矿区同时不满。',
      '认知不变：危机被推迟，但关键瓶颈仍未知。'
    ],
    result: '账面短期变好，但矿井仍在涌水，国家没有获得新的工业能力。'
  }
]);

export function resolveDecision(state, decisionId) {
  const decision = DECISIONS.find((item) => item.id === decisionId);
  if (!decision) throw new Error(`Unknown decision: ${decisionId}`);

  const next = { ...state };
  for (const [key, delta] of Object.entries(decision.effects)) {
    next[key] = Math.max(0, state[key] + delta);
  }
  next.turn = state.turn + 1;

  return {
    nextState: next,
    decision,
    audit: [...decision.audit],
    result: decision.result
  };
}
