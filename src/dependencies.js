// 依赖规则：前置项数量上限、同位置约束、循环检测与阻塞判断

export const MAX_PREREQUISITES = 2;

export function getRepair(repairs, id) {
  return repairs.find((repair) => repair.id === id);
}

export function getPrerequisites(repairs, repair) {
  return (repair.prerequisites || []).map((id) => getRepair(repairs, id)).filter(Boolean);
}

// 未完工的前置项，即阻塞来源
export function getBlockingPrerequisites(repairs, repair) {
  return getPrerequisites(repairs, repair).filter((prerequisite) => prerequisite.status !== "done");
}

export function isReady(repairs, repair) {
  return repair.status !== "done" && getBlockingPrerequisites(repairs, repair).length === 0;
}

export function isBlocked(repairs, repair) {
  return repair.status !== "done" && getBlockingPrerequisites(repairs, repair).length > 0;
}

// 直接依赖某事项的下游事项
export function getDependents(repairs, id) {
  return repairs.filter((repair) => (repair.prerequisites || []).includes(id));
}

// 校验 target 要设置的前置项；不通过时 errors 里带冲突事项，供页面指出
export function validatePrerequisites(repairs, target, prerequisiteIds) {
  const ids = [...new Set(prerequisiteIds.filter(Boolean))];
  const errors = [];

  if (ids.length > MAX_PREREQUISITES) {
    errors.push({
      type: "limit",
      message: `「${target.title}」最多只能挂 ${MAX_PREREQUISITES} 个前置项，当前选择了 ${ids.length} 个`,
      conflicts: ids.map((id) => getRepair(repairs, id)).filter(Boolean)
    });
  }

  if (ids.includes(target.id)) {
    errors.push({
      type: "self",
      message: `「${target.title}」不能把自己设为前置项`,
      conflicts: [target]
    });
  }

  if (ids.some((id) => !getRepair(repairs, id))) {
    errors.push({
      type: "missing",
      message: `「${target.title}」选择的前置项已不存在，请重新选择`,
      conflicts: []
    });
  }

  const crossLocation = ids
    .map((id) => getRepair(repairs, id))
    .filter((prerequisite) => prerequisite && prerequisite.location !== target.location);
  if (crossLocation.length) {
    errors.push({
      type: "location",
      message: `跨位置依赖被拒绝：${crossLocation.map((item) => `「${item.title}」(${item.location})`).join("、")} 与「${target.title}」(${target.location}) 不在同一位置`,
      conflicts: crossLocation
    });
  }

  for (const id of ids) {
    if (id === target.id) continue;
    const path = findPath(repairs, id, target.id);
    if (path) {
      const cycle = [target, ...path];
      errors.push({
        type: "cycle",
        message: `循环依赖被拒绝：${cycle.map((item) => `「${item.title}」`).join(" → ")}`,
        conflicts: cycle
      });
    }
  }

  return { ok: errors.length === 0, errors };
}

// 沿前置边从 fromId 找到 toId 的路径（含两端），找不到返回 null
function findPath(repairs, fromId, toId) {
  const visited = new Set([fromId]);
  const parent = new Map();
  const stack = [fromId];
  while (stack.length) {
    const current = stack.pop();
    if (current === toId) {
      const chain = [];
      let node = toId;
      while (node) {
        const repair = getRepair(repairs, node);
        if (repair) chain.unshift(repair);
        node = parent.get(node);
      }
      return chain;
    }
    const repair = getRepair(repairs, current);
    for (const next of (repair && repair.prerequisites) || []) {
      if (visited.has(next)) continue;
      visited.add(next);
      parent.set(next, current);
      stack.push(next);
    }
  }
  return null;
}
