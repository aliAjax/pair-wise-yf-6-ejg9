// 本地存储：读写 localStorage，并对旧数据做归一化

import { MAX_PREREQUISITES } from "./dependencies.js";

const STORAGE_KEY = "zfl-14-repairs";

export function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return normalize(JSON.parse(saved));
  } catch (error) {
    console.warn("本地数据读取失败，已使用初始数据", error);
  }
  return createInitialState();
}

export function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function createInitialState() {
  const inspection = {
    id: crypto.randomUUID(),
    location: "厨房",
    title: "水槽下方渗水",
    priority: "high",
    cost: 260,
    status: "todo",
    photo: "",
    note: "先检查软管接口",
    prerequisites: []
  };
  const replacement = {
    id: crypto.randomUUID(),
    location: "厨房",
    title: "更换老化软管",
    priority: "medium",
    cost: 120,
    status: "todo",
    photo: "",
    note: "等渗水点处理完再施工",
    prerequisites: [inspection.id]
  };
  return { repairs: [replacement, inspection] };
}

function normalize(state) {
  const repairs = Array.isArray(state.repairs) ? state.repairs : [];
  const ids = new Set(repairs.map((repair) => repair.id));
  return {
    repairs: repairs.map((repair) => ({
      ...repair,
      prerequisites: (Array.isArray(repair.prerequisites) ? repair.prerequisites : [])
        .filter((id) => id !== repair.id && ids.has(id))
        .slice(0, MAX_PREREQUISITES)
    }))
  };
}
