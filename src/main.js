import "./styles.css";
import { loadState, saveState } from "./storage.js";
import {
  MAX_PREREQUISITES,
  validatePrerequisites,
  getPrerequisites,
  getBlockingPrerequisites,
  isReady,
  isBlocked
} from "./dependencies.js";
import { changeStatus, removeRepair, checkStartable } from "./statusFlow.js";

const statuses = {
  todo: "待处理",
  doing: "处理中",
  done: "已完成"
};

const priorities = {
  high: "高优先级",
  medium: "中优先级",
  low: "低优先级"
};

let state = loadState();
let notice = null;
let formDraft = null;
const app = document.querySelector("#app");

function render() {
  const draft = formDraft || {};
  const unfinished = state.repairs.filter((repair) => repair.status !== "done");
  const totalCost = unfinished.reduce((total, repair) => total + Number(repair.cost || 0), 0);
  const doing = state.repairs.filter((repair) => repair.status === "doing").length;
  const blockedCount = state.repairs.filter((repair) => isBlocked(state.repairs, repair)).length;

  const groups = [
    { key: "ready", label: "可开工", items: state.repairs.filter((repair) => isReady(state.repairs, repair)) },
    { key: "blocked", label: "被阻塞", items: state.repairs.filter((repair) => isBlocked(state.repairs, repair)) },
    { key: "done", label: "已完成", items: state.repairs.filter((repair) => repair.status === "done") }
  ];

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
          <div class="stat"><span>被阻塞</span><strong>${blockedCount}</strong></div>
          <div class="stat"><span>预计费用（未完成）</span><strong>¥${totalCost}</strong></div>
        </section>
      </header>

      ${notice ? `<div class="notice ${notice.type}">${escapeHtml(notice.text)}</div>` : ""}

      <section class="layout">
        <aside class="panel">
          <h2>新增维修事项</h2>
          <form class="form" id="repair-form">
            <label>位置<input name="location" required placeholder="例如卫生间" value="${escapeHtml(draft.location || "")}"></label>
            <label>问题描述<textarea name="title" required placeholder="例如门锁松动">${escapeHtml(draft.title || "")}</textarea></label>
            <label>优先级<select name="priority">${renderOptions(priorities, draft.priority || "medium")}</select></label>
            <label>预计费用<input name="cost" type="number" min="0" step="1" value="${escapeHtml(draft.cost ?? "0")}"></label>
            <label>处理状态<select name="status">${renderOptions(statuses, draft.status || "todo")}</select></label>
            <label>前置工序一（可选）<select name="prereq1">${renderPrereqOptions(null, draft.prereq1)}</select></label>
            <label>前置工序二（可选）<select name="prereq2">${renderPrereqOptions(null, draft.prereq2)}</select></label>
            <p class="hint">前置工序需与本事项同位置，最多 ${MAX_PREREQUISITES} 个，全部完工后才能开工。</p>
            <label>照片链接<input name="photo" type="url" placeholder="可选，粘贴图片地址" value="${escapeHtml(draft.photo || "")}"></label>
            <label>备注<textarea name="note" placeholder="师傅电话、材料或注意事项">${escapeHtml(draft.note || "")}</textarea></label>
            <button class="primary" type="submit">保存事项</button>
          </form>
        </aside>

        <section>
          ${groups.map(renderGroup).join("")}
        </section>
      </section>
    </main>
  `;

  bindEvents();
}

function renderGroup(group) {
  const subtotal = group.items.reduce((total, repair) => total + Number(repair.cost || 0), 0);
  return `
    <section class="group">
      <header class="group-header">
        <h2>${group.label}</h2>
        <span class="chip">${group.items.length} 项</span>
        ${group.key !== "done" ? `<span class="chip">预计 ¥${subtotal}</span>` : ""}
      </header>
      <div class="repairs">
        ${group.items.length ? group.items.map(renderRepair).join("") : `<div class="empty">当前分组没有维修事项</div>`}
      </div>
    </section>
  `;
}

function renderRepair(repair) {
  const prerequisites = getPrerequisites(state.repairs, repair);
  const blocking = getBlockingPrerequisites(state.repairs, repair);
  const blocked = isBlocked(state.repairs, repair);
  return `
    <article class="repair${blocked ? " blocked" : ""}">
      <div class="photo">${repair.photo ? `<img src="${escapeHtml(repair.photo)}" alt="${escapeHtml(repair.location)}维修照片">` : "未添加照片"}</div>
      <div class="content">
        <div class="row">
          <h3>${escapeHtml(repair.location)}</h3>
          <span class="priority ${repair.priority}">${priorities[repair.priority]}</span>
          <span class="status ${repair.status}">${statuses[repair.status]}</span>
          ${blocked ? `<span class="status blocked-tag">被阻塞</span>` : ""}
        </div>
        <p>${escapeHtml(repair.title)}</p>
        <div class="row">
          <span class="chip">预计 ¥${Number(repair.cost || 0)}</span>
          <span class="chip">${escapeHtml(repair.note || "暂无备注")}</span>
        </div>
        ${prerequisites.length ? `
          <div class="row">
            <span class="chip">前置工序</span>
            ${prerequisites.map((item) => `<span class="chip ${item.status === "done" ? "ok" : "pending"}">${escapeHtml(item.title)} · ${statuses[item.status]}</span>`).join("")}
          </div>` : ""}
        ${blocking.length ? `<p class="blocking">等待前置完工：${blocking.map((item) => `「${escapeHtml(item.title)}」`).join("、")}</p>` : ""}
        <div class="actions">
          <select data-status="${repair.id}">${renderOptions(statuses, repair.status)}</select>
          <button class="ghost" data-delete="${repair.id}">删除</button>
        </div>
        <div class="prereq-editor">
          <span>前置工序（同位置，最多 ${MAX_PREREQUISITES} 个）</span>
          <div class="prereq-selects">
            <select data-prereq="${repair.id}" data-slot="0">${renderPrereqOptions(repair.id, prerequisites[0]?.id)}</select>
            <select data-prereq="${repair.id}" data-slot="1">${renderPrereqOptions(repair.id, prerequisites[1]?.id)}</select>
          </div>
        </div>
      </div>
    </article>
  `;
}

function renderOptions(map, selected) {
  return Object.entries(map)
    .map(([value, label]) => `<option value="${value}" ${selected === value ? "selected" : ""}>${label}</option>`)
    .join("");
}

function renderPrereqOptions(excludeId, selectedId) {
  const options = state.repairs
    .filter((repair) => repair.id !== excludeId)
    .map((repair) => `<option value="${repair.id}" ${selectedId === repair.id ? "selected" : ""}>${escapeHtml(repair.location)} · ${escapeHtml(repair.title)}（${statuses[repair.status]}）</option>`)
    .join("");
  return `<option value="">无</option>${options}`;
}

function bindEvents() {
  document.querySelector("#repair-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.target));
    const repair = {
      id: crypto.randomUUID(),
      location: data.location.trim(),
      title: data.title.trim(),
      priority: data.priority,
      cost: Number(data.cost || 0),
      status: data.status,
      photo: data.photo.trim(),
      note: data.note.trim(),
      prerequisites: [...new Set([data.prereq1, data.prereq2].filter(Boolean))]
    };

    const validation = validatePrerequisites(state.repairs, repair, repair.prerequisites);
    if (!validation.ok) {
      formDraft = { ...data };
      notice = { type: "error", text: validation.errors.map((error) => error.message).join("；") };
      render();
      return;
    }

    if (repair.status !== "todo") {
      const check = checkStartable(state.repairs, repair);
      if (!check.ok) {
        formDraft = { ...data };
        notice = { type: "error", text: check.message };
        render();
        return;
      }
    }

    state.repairs.unshift(repair);
    formDraft = null;
    notice = { type: "ok", text: `已保存「${repair.title}」` };
    saveState();
    render();
  });

  document.querySelectorAll("[data-status]").forEach((select) => {
    select.addEventListener("change", () => {
      const result = changeStatus(state.repairs, select.dataset.status, select.value);
      if (!result.ok) {
        notice = { type: "error", text: result.message };
      } else {
        notice = {
          type: "ok",
          text: result.reset.length
            ? `状态已更新，${result.reset.length} 个下游事项回到待处理：${result.reset.map((item) => `「${item.title}」`).join("、")}`
            : "状态已更新"
        };
        saveState();
      }
      render();
    });
  });

  document.querySelectorAll("[data-prereq]").forEach((select) => {
    select.addEventListener("change", () => {
      const repair = state.repairs.find((item) => item.id === select.dataset.prereq);
      if (!repair) return;
      const ids = [...document.querySelectorAll(`[data-prereq="${repair.id}"]`)]
        .sort((a, b) => Number(a.dataset.slot) - Number(b.dataset.slot))
        .map((input) => input.value)
        .filter(Boolean);
      const validation = validatePrerequisites(state.repairs, repair, ids);
      if (!validation.ok) {
        notice = { type: "error", text: validation.errors.map((error) => error.message).join("；") };
      } else {
        repair.prerequisites = [...new Set(ids)];
        notice = { type: "ok", text: `「${repair.title}」的前置工序已更新` };
        saveState();
      }
      render();
    });
  });

  document.querySelectorAll("[data-delete]").forEach((button) => {
    button.addEventListener("click", () => {
      const target = state.repairs.find((item) => item.id === button.dataset.delete);
      const result = removeRepair(state.repairs, button.dataset.delete);
      state.repairs = result.remaining;
      notice = {
        type: "ok",
        text: result.reset.length
          ? `已删除「${target ? target.title : ""}」，${result.reset.length} 个下游事项回到待处理：${result.reset.map((item) => `「${item.title}」`).join("、")}`
          : `已删除「${target ? target.title : ""}」`
      };
      saveState();
      render();
    });
  });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);
}

render();
