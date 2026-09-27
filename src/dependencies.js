// 依赖规则：前置项校验、循环/跨位置检测、阻塞与可开工判断

export const MAX_PREREQS = 2;

// 归一化：去重、去掉自身、最多两个
export function normalizePrereqIds(selfId, ids) {
  const unique = [...new Set((ids || []).filter((id) => id && id !== selfId))];
  return unique.slice(0, MAX_PREREQS);
}

// 校验拟设置的依赖，返回 { ok, errors: [{ prereqId, reason }] }
export function validateDependencies(repairs, selfId, prereqIds) {
  const errors = [];
  const byId = new Map(repairs.map((repair) => [repair.id, repair]));
  const self = byId.get(selfId);
  if (!self) return { ok: false, errors: [{ prereqId: null, reason: "missing-self" }] };

  const unique = [...new Set((prereqIds || []).filter(Boolean))];
  if (unique.length > MAX_PREREQS) {
    errors.push({ prereqId: null, reason: "too-many" });
  }

  for (const prereqId of unique) {
    if (prereqId === selfId) {
      errors.push({ prereqId, reason: "self" });
      continue;
    }
    const prereq = byId.get(prereqId);
    if (!prereq) {
      errors.push({ prereqId, reason: "missing" });
      continue;
    }
    if (prereq.location !== self.location) {
      errors.push({ prereqId, reason: "cross-location" });
      continue;
    }
    if (createsCycle(repairs, selfId, prereqId)) {
      errors.push({ prereqId, reason: "cycle" });
    }
  }

  return { ok: errors.length === 0, errors };
}

// 若 self 依赖 prereq，沿现有依赖链能否从 prereq 走回 self
function createsCycle(repairs, selfId, prereqId) {
  const byId = new Map(repairs.map((repair) => [repair.id, repair]));
  const visited = new Set();
  const queue = [prereqId];
  while (queue.length) {
    const current = queue.shift();
    if (current === selfId) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    const node = byId.get(current);
    for (const next of node?.prereqIds || []) queue.push(next);
  }
  return false;
}

// 未完成的前置项 id 列表
export function blockingPrereqIds(repairs, repair) {
  const byId = new Map(repairs.map((item) => [item.id, item]));
  return (repair.prereqIds || []).filter((id) => {
    const prereq = byId.get(id);
    return prereq && prereq.status !== "done";
  });
}

export function isBlocked(repairs, repair) {
  return repair.status !== "done" && blockingPrereqIds(repairs, repair).length > 0;
}

export function isReady(repairs, repair) {
  return repair.status !== "done" && !isBlocked(repairs, repair);
}

// 依赖它的下游事项
export function dependentIds(repairs, repairId) {
  return repairs.filter((repair) => (repair.prereqIds || []).includes(repairId)).map((repair) => repair.id);
}
