import "./styles.css";
import { loadState, saveState } from "./storage.js";
import {
  MAX_PREREQS,
  normalizePrereqIds,
  validateDependencies,
  blockingPrereqIds
} from "./dependencies.js";
import { transitionStatus, cascadeDependents, groupByReadiness } from "./statusFlow.js";

const statuses = {
  all: "全部",
  todo: "待处理",
  doing: "处理中",
  done: "已完成"
};

const priorities = {
  high: "高优先级",
  medium: "中优先级",
  low: "低优先级"
};

const groups = {
  ready: "可开工",
  blocked: "被阻塞",
  done: "已完成"
};

const conflictReasons = {
  "too-many": () => `每个事项最多挂 ${MAX_PREREQS} 个前置项`,
  self: () => "不能把自己设为前置项",
  missing: () => "前置事项不存在",
  "cross-location": (repair) => `「${label(repair)}」不在同一位置，不能作为前置项`,
  cycle: (repair) => `「${label(repair)}」与本事项形成循环依赖`,
  blocked: (repair) => `前置项「${label(repair)}」尚未完工，不能开工`
};

let state = loadState();
const app = document.querySelector("#app");

function render() {
  const repairs = filteredRepairs();
  const grouped = groupByReadiness(repairs);
  const unfinished = state.repairs.filter((repair) => repair.status !== "done");
  // 费用统计只算未完成事项
  const totalCost = unfinished.reduce((total, repair) => total + Number(repair.cost || 0), 0);
  const doing = state.repairs.filter((repair) => repair.status === "doing").length;

  app.innerHTML = `
    <main class="shell">
      <header class="header">
        <div>
          <p class="eyebrow">本地家庭维护台</p>
          <h1>家庭维修事项</h1>
        </div>
        <section class="stats">
          <div class="stat"><span>未完成</span><strong>${unfinished.length}</strong></div>
          <div class="stat"><span>处理中</span><strong>${doing}</strong></div>
          <div class="stat"><span>预计费用</span><strong>¥${totalCost}</strong></div>
        </section>
      </header>

      <section class="layout">
        <aside class="panel">
          <h2>新增维修事项</h2>
          <form class="form" id="repair-form">
            <label>位置<input name="location" required placeholder="例如卫生间"></label>
            <label>问题描述<textarea name="title" required placeholder="例如门锁松动"></textarea></label>
            <label>优先级<select name="priority">${renderPriorityOptions("medium")}</select></label>
            <label>预计费用<input name="cost" type="number" min="0" step="1" value="0"></label>
            <label>处理状态<select name="status">${renderStatusOptions("todo")}</select></label>
            <label>照片链接<input name="photo" type="url" placeholder="可选，粘贴图片地址"></label>
            <label>备注<textarea name="note" placeholder="师傅电话、材料或注意事项"></textarea></label>
            ${renderPrereqPicker()}
            <p class="form-error" id="form-error" hidden></p>
            <button class="primary" type="submit">保存事项</button>
          </form>
        </aside>

        <section>
          <div class="toolbar">
            ${Object.entries(statuses).map(([value, label]) => `<button class="seg ${state.filter === value ? "active" : ""}" data-filter="${value}">${label}</button>`).join("")}
          </div>
          ${Object.entries(groups)
            .map(([key, title]) => renderGroup(title, grouped[key]))
            .join("")}
        </section>
      </section>
    </main>
  `;

  bindEvents();
}

function renderGroup(title, repairs) {
  return `
    <section class="group">
      <h2 class="group-title">${title}<span class="group-count">${repairs.length}</span></h2>
      <div class="repairs">
        ${repairs.length ? repairs.map(renderRepair).join("") : `<div class="empty">该分组下没有维修事项</div>`}
      </div>
    </section>
  `;
}

function renderRepair(repair) {
  const blockers = blockingPrereqIds(state.repairs, repair).map((id) => findRepair(id)).filter(Boolean);
  const prereqs = (repair.prereqIds || []).map((id) => findRepair(id)).filter(Boolean);
  return `
    <article class="repair">
      <div class="photo">${repair.photo ? `<img src="${escapeHtml(repair.photo)}" alt="${escapeHtml(repair.location)}维修照片">` : "未添加照片"}</div>
      <div class="content">
        <div class="row">
          <h3>${escapeHtml(repair.location)}</h3>
          <span class="priority ${repair.priority}">${priorities[repair.priority]}</span>
          <span class="status ${repair.status}">${statuses[repair.status]}</span>
        </div>
        <p>${escapeHtml(repair.title)}</p>
        <div class="row">
          <span class="chip">预计 ¥${Number(repair.cost || 0)}</span>
          <span class="chip">${escapeHtml(repair.note || "暂无备注")}</span>
        </div>
        ${prereqs.length ? `<div class="row prereqs">前置项：${prereqs.map((item) => `<span class="chip ${item.status === "done" ? "prereq-done" : "prereq-wait"}">${escapeHtml(label(item))}（${statuses[item.status]}）</span>`).join("")}</div>` : ""}
        ${blockers.length ? `<p class="blocked-tip">被阻塞：${blockers.map((item) => `「${escapeHtml(label(item))}」`).join("、")} 尚未完工</p>` : ""}
        <div class="actions">
          <select data-status="${repair.id}">${renderStatusOptions(repair.status)}</select>
          <button class="ghost" data-delete="${repair.id}">删除</button>
        </div>
        <p class="form-error" data-error="${repair.id}" hidden></p>
      </div>
    </article>
  `;
}

function renderPrereqPicker() {
  if (!state.repairs.length) return "";
  return `
    <fieldset class="prereq-picker">
      <legend>前置项（同位置，最多 ${MAX_PREREQS} 个）</legend>
      ${state.repairs
        .map(
          (repair) => `
        <label class="prereq-option">
          <input type="checkbox" name="prereq" value="${repair.id}">
          <span>${escapeHtml(label(repair))}（${statuses[repair.status]}）</span>
        </label>`
        )
        .join("")}
    </fieldset>
  `;
}

function renderStatusOptions(selected) {
  return Object.entries(statuses)
    .filter(([value]) => value !== "all")
    .map(([value, label]) => `<option value="${value}" ${selected === value ? "selected" : ""}>${label}</option>`)
    .join("");
}

function renderPriorityOptions(selected) {
  return Object.entries(priorities)
    .map(([value, label]) => `<option value="${value}" ${selected === value ? "selected" : ""}>${label}</option>`)
    .join("");
}

function bindEvents() {
  document.querySelector("#repair-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.target));
    const id = crypto.randomUUID();
    const repair = {
      id,
      location: data.location.trim(),
      title: data.title.trim(),
      priority: data.priority,
      cost: Number(data.cost || 0),
      status: data.status,
      photo: data.photo.trim(),
      note: data.note.trim(),
      prereqIds: []
    };

    const picked = new FormData(event.target).getAll("prereq");
    const prereqIds = normalizePrereqIds(id, picked);
    const check = validateDependencies([...state.repairs, repair], id, prereqIds);
    if (!check.ok) {
      showError("form-error", conflictMessages(check.errors));
      return;
    }
    repair.prereqIds = prereqIds;

    state.repairs.unshift(repair);
    if (repair.status === "done") repair.completedAt = new Date().toISOString();
    saveState(state);
    render();
  });

  document.querySelectorAll("[data-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      state.filter = button.dataset.filter;
      saveState(state);
      render();
    });
  });

  document.querySelectorAll("[data-status]").forEach((select) => {
    select.addEventListener("change", () => {
      const result = transitionStatus(state.repairs, select.dataset.status, select.value);
      if (!result.ok) {
        showError(`[data-error="${select.dataset.status}"]`, conflictMessages(result.errors));
        select.value = state.repairs.find((item) => item.id === select.dataset.status).status;
        return;
      }
      saveState(state);
      render();
    });
  });

  document.querySelectorAll("[data-delete]").forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.dataset.delete;
      // 上游被移除：未完成的下游回到待处理，已完成记录保留
      cascadeDependents(state.repairs, id);
      state.repairs = state.repairs.filter((repair) => repair.id !== id);
      for (const repair of state.repairs) {
        repair.prereqIds = (repair.prereqIds || []).filter((prereqId) => prereqId !== id);
      }
      saveState(state);
      render();
    });
  });
}

function conflictMessages(errors) {
  return errors.map((error) => {
    const prereq = error.prereqId ? findRepair(error.prereqId) : null;
    const reason = conflictReasons[error.reason];
    return reason ? reason(prereq) : "依赖校验失败";
  });
}

function showError(selector, messages) {
  const box = document.querySelector(selector);
  if (!box) return;
  box.textContent = messages.join("；");
  box.hidden = false;
}

function filteredRepairs() {
  if (state.filter === "all") return state.repairs;
  return state.repairs.filter((repair) => repair.status === state.filter);
}

function findRepair(id) {
  return state.repairs.find((repair) => repair.id === id);
}

function label(repair) {
  return `${repair.location}·${repair.title}`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);
}

render();
