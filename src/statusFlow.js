// 状态流转：开工守卫、上游变更时的下游级联重置

import { getDependents, getBlockingPrerequisites } from "./dependencies.js";

// 开工（或直接完工）前确认前置工序全部完工
export function checkStartable(repairs, repair) {
  const blocking = getBlockingPrerequisites(repairs, repair);
  return {
    ok: blocking.length === 0,
    blocking,
    message: blocking.length
      ? `「${repair.title}」暂不能开工，前置工序未完工：${blocking.map((item) => `「${item.title}」`).join("、")}`
      : ""
  };
}

export function changeStatus(repairs, repairId, nextStatus) {
  const repair = repairs.find((item) => item.id === repairId);
  if (!repair) return { ok: false, message: "事项不存在", reset: [] };

  const previous = repair.status;
  if (previous === nextStatus) return { ok: true, repair, reset: [] };

  if ((nextStatus === "doing" || nextStatus === "done") && previous !== "done") {
    const check = checkStartable(repairs, repair);
    if (!check.ok) return { ok: false, message: check.message, reset: [] };
  }

  repair.status = nextStatus;

  // 已完成的上游被重新打开，下游回到待处理；已完成的记录保留
  const reset = previous === "done" && nextStatus !== "done" ? resetDependents(repairs, repairId) : [];
  return { ok: true, repair, reset };
}

export function removeRepair(repairs, repairId) {
  const target = repairs.find((item) => item.id === repairId);
  if (!target) return { ok: false, message: "事项不存在", remaining: repairs, reset: [] };

  // 上游被移除，下游同样回到待处理（已完成的保留）
  const reset = resetDependents(repairs, repairId);

  // 清理指向被删事项的前置引用
  for (const repair of repairs) {
    repair.prerequisites = (repair.prerequisites || []).filter((id) => id !== repairId);
  }

  return { ok: true, remaining: repairs.filter((item) => item.id !== repairId), reset };
}

// 级联重置下游；已完成的下游保留，且不再透过它继续向下传导
function resetDependents(repairs, repairId) {
  const reset = [];
  const seen = new Set([repairId]);
  const queue = [repairId];
  while (queue.length) {
    const current = queue.shift();
    for (const dependent of getDependents(repairs, current)) {
      if (seen.has(dependent.id)) continue;
      seen.add(dependent.id);
      if (dependent.status === "done") continue;
      if (dependent.status !== "todo") {
        dependent.status = "todo";
        reset.push(dependent);
      }
      queue.push(dependent.id);
    }
  }
  return reset;
}
