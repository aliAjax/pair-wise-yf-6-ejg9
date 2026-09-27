// 本地存储：读取、保存与旧数据迁移

const STORAGE_KEY = "zfl-14-repairs";

export function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    const state = JSON.parse(saved);
    state.repairs = (state.repairs || []).map(migrateRepair);
    return state;
  }
  return {
    filter: "all",
    repairs: [
      {
        id: crypto.randomUUID(),
        location: "厨房",
        title: "水槽下方渗水",
        priority: "high",
        cost: 260,
        status: "todo",
        photo: "",
        note: "先检查软管接口",
        prereqIds: []
      }
    ]
  };
}

export function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// 旧数据没有 prereqIds，补上空数组
function migrateRepair(repair) {
  return { prereqIds: [], ...repair };
}
