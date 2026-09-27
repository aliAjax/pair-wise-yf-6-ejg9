// 状态流转：开工校验、完工/重开、上游变化时的下游级联

import { blockingPrereqIds, dependentIds, isBlocked } from "./dependencies.js";

// 尝试把事项切换到目标状态，返回 { ok, repair, errors }
// 开工（处理中）前必须确认前置项全部完工；完工/重开会级联影响下游
export function transitionStatus(repairs, repairId, nextStatus) {
  const repair = repairs.find((item) => item.id === repairId);
  if (!repair) return { ok: false, errors: [{ reason: "missing" }] };
  if (repair.status === nextStatus) return { ok: true, repair, errors: [] };

  if (nextStatus === "doing") {
    const blockers = blockingPrereqIds(repairs, repair);
    if (blockers.length) {
      return { ok: false, errors: blockers.map((prereqId) => ({ prereqId, reason: "blocked" })) };
    }
  }

  repair.status = nextStatus;

  if (nextStatus === "done") {
    // 完工时记录时间，已完成记录保留
    repair.completedAt = new Date().toISOString();
  } else {
    delete repair.completedAt;
    // 被重新打开（或退回）时，未完成的下游回到待处理
    cascadeDependents(repairs, repairId);
  }

  return { ok: true, repair, errors: [] };
}

// 上游被移除或重新打开：未完成的下游一律回到待处理，已完成记录保留
export function cascadeDependents(repairs, repairId) {
  for (const id of dependentIds(repairs, repairId)) {
    const dependent = repairs.find((item) => item.id === id);
    if (dependent && dependent.status !== "done") {
      dependent.status = "todo";
    }
  }
}

// 首页分组：可开工 / 被阻塞 / 已完成
export function groupByReadiness(repairs) {
  const groups = { ready: [], blocked: [], done: [] };
  for (const repair of repairs) {
    if (repair.status === "done") groups.done.push(repair);
    else if (isBlocked(repairs, repair)) groups.blocked.push(repair);
    else groups.ready.push(repair);
  }
  return groups;
}
