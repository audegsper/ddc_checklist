import { createLocalRepository } from "./storage.js";
import { createSupabaseRepository } from "./supabase.js";
import { escapeHtml, formatKoreanDate, formatKoreanDateTime } from "./utils.js";

const config = window.__APP_CONFIG__ ?? {};
const state = {
  bootstrap: null,
  selectedEmployeeId: "",
  repository: null,
};

const elements = {
  title: document.getElementById("app-title"),
  todayLabel: document.getElementById("today-label"),
  syncPill: document.getElementById("sync-pill"),
  employeeSelect: document.getElementById("employee-select"),
  employeeHelp: document.getElementById("employee-help"),
  spacesList: document.getElementById("spaces-list"),
  employeeForm: document.getElementById("employee-form"),
  employeeName: document.getElementById("employee-name"),
  employeeList: document.getElementById("employee-list"),
  spaceForm: document.getElementById("space-form"),
  spaceName: document.getElementById("space-name"),
  manageSpacesList: document.getElementById("manage-spaces-list"),
  historyList: document.getElementById("history-list"),
  historySummary: document.getElementById("history-summary"),
  settingsForm: document.getElementById("settings-form"),
  historyLimit: document.getElementById("history-limit"),
  setupStatus: document.getElementById("setup-status"),
  template: document.getElementById("space-card-template"),
  tabs: Array.from(document.querySelectorAll(".tab")),
  panels: Array.from(document.querySelectorAll(".panel")),
};

function getSelectedEmployee() {
  return state.bootstrap?.employees.find((item) => item.id === state.selectedEmployeeId) ?? null;
}

function canUseSupabase() {
  return Boolean(config.useSupabase && config.supabaseUrl && config.supabaseAnonKey);
}

async function createRepository() {
  if (canUseSupabase()) {
    return createSupabaseRepository(config);
  }
  return createLocalRepository(config.timezone || "Asia/Seoul");
}

async function refresh() {
  state.bootstrap = await state.repository.getBootstrap();

  const activeEmployees = state.bootstrap.employees ?? [];
  if (!activeEmployees.some((item) => item.id === state.selectedEmployeeId)) {
    state.selectedEmployeeId = activeEmployees[0]?.id ?? "";
  }

  renderHeader();
  renderEmployees();
  renderSpaces();
  renderManageSpaces();
  renderHistory();
  renderSettings();
}

function renderHeader() {
  elements.title.textContent = config.appName || "병원 체크리스트";
  elements.todayLabel.textContent = formatKoreanDate(new Date(), config.timezone || "Asia/Seoul");
  elements.syncPill.textContent = canUseSupabase() ? "Supabase 연결됨" : "데모 모드";
  elements.setupStatus.innerHTML = canUseSupabase()
    ? "현재 `Supabase` 연결 설정이 켜져 있습니다. 실제 DB에 저장됩니다."
    : "`site/app-config.js`에 Supabase 값을 넣기 전까지는 브라우저 로컬 저장소를 사용합니다.";
}

function renderEmployees() {
  const employees = state.bootstrap.employees ?? [];
  elements.employeeSelect.innerHTML = "";

  if (!employees.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "직원을 먼저 추가해 주세요";
    elements.employeeSelect.append(option);
    elements.employeeSelect.disabled = true;
    elements.employeeHelp.textContent = "관리 탭에서 직원을 추가하면 여기에서 선택할 수 있습니다.";
    elements.employeeList.innerHTML = '<div class="empty-state">아직 등록된 직원이 없습니다.</div>';
    return;
  }

  elements.employeeSelect.disabled = false;
  elements.employeeHelp.textContent = "공간 카드에서 확인 또는 메모 저장 시 현재 선택 직원 이름으로 기록됩니다.";
  employees.forEach((employee) => {
    const option = document.createElement("option");
    option.value = employee.id;
    option.textContent = employee.name;
    option.selected = employee.id === state.selectedEmployeeId;
    elements.employeeSelect.append(option);
  });

  elements.employeeList.innerHTML = employees
    .map((employee) => `<span class="chip">${escapeHtml(employee.name)}</span>`)
    .join("");
}

function latestLogForSpace(spaceId) {
  return (state.bootstrap.activity_logs ?? []).find((log) => log.space_id === spaceId) ?? null;
}

function renderSpaces() {
  const spaces = state.bootstrap.spaces ?? [];
  elements.spacesList.innerHTML = "";

  if (!spaces.length) {
    elements.spacesList.innerHTML =
      '<div class="empty-state">공간을 추가하면 이곳에 점검 카드가 표시됩니다.</div>';
    return;
  }

  spaces.forEach((space) => {
    const fragment = elements.template.content.cloneNode(true);
    const card = fragment.querySelector(".space-card");
    const name = fragment.querySelector(".space-card__name");
    const template = fragment.querySelector(".space-card__template");
    const commentInput = fragment.querySelector(".space-card__comment");
    const latest = fragment.querySelector(".space-card__latest");
    const confirmButton = fragment.querySelector('[data-action="confirm"]');
    const saveCommentButton = fragment.querySelector('[data-action="save-comment"]');

    name.textContent = space.name;
    template.textContent = space.checklist_template?.trim() || "아직 체크 항목 메모가 없습니다.";

    const recent = latestLogForSpace(space.id);
    latest.textContent = recent
      ? `최근 기록: ${recent.employee_name} · ${formatKoreanDateTime(recent.created_at, config.timezone || "Asia/Seoul")}`
      : "아직 기록이 없습니다.";

    confirmButton.addEventListener("click", async () => {
      const employee = getSelectedEmployee();
      if (!employee) {
        window.alert("먼저 직원을 선택해 주세요.");
        return;
      }

      confirmButton.disabled = true;
      try {
        await state.repository.addCheck({
          employeeId: employee.id,
          employeeName: employee.name,
          spaceId: space.id,
          spaceName: space.name,
        });
        await refresh();
      } catch (error) {
        window.alert(`확인 기록 저장에 실패했습니다.\n${error.message}`);
      } finally {
        confirmButton.disabled = false;
      }
    });

    saveCommentButton.addEventListener("click", async () => {
      const employee = getSelectedEmployee();
      const memo = commentInput.value.trim();

      if (!employee) {
        window.alert("먼저 직원을 선택해 주세요.");
        return;
      }

      if (!memo) {
        window.alert("메모 내용을 입력해 주세요.");
        return;
      }

      saveCommentButton.disabled = true;
      try {
        await state.repository.addComment({
          employeeId: employee.id,
          employeeName: employee.name,
          spaceId: space.id,
          spaceName: space.name,
          memo,
        });
        await refresh();
      } catch (error) {
        window.alert(`메모 저장에 실패했습니다.\n${error.message}`);
      } finally {
        saveCommentButton.disabled = false;
      }
    });

    elements.spacesList.append(card);
  });
}

function renderManageSpaces() {
  const spaces = state.bootstrap.spaces ?? [];
  elements.manageSpacesList.innerHTML = "";

  if (!spaces.length) {
    elements.manageSpacesList.innerHTML =
      '<div class="empty-state">공간을 추가하면 이곳에서 체크 항목 메모를 편집할 수 있습니다.</div>';
    return;
  }

  spaces.forEach((space) => {
    const wrapper = document.createElement("article");
    wrapper.className = "manage-space-card";
    wrapper.innerHTML = `
      <div class="manage-space-card__top">
        <h4>${escapeHtml(space.name)}</h4>
        <span class="chip">순서 ${space.sort_order ?? "-"}</span>
      </div>
      <label class="field">
        <span class="field__label">공간 체크 항목 메모</span>
        <textarea rows="5" data-role="template-input">${escapeHtml(space.checklist_template ?? "")}</textarea>
      </label>
      <div class="space-card__actions">
        <button class="secondary-button" data-role="save-space">공간 메모 저장</button>
      </div>
    `;

    const textarea = wrapper.querySelector('[data-role="template-input"]');
    const saveButton = wrapper.querySelector('[data-role="save-space"]');

    saveButton.addEventListener("click", async () => {
      saveButton.disabled = true;
      try {
        await state.repository.updateSpace(space.id, { checklist_template: textarea.value.trim() });
        await refresh();
      } catch (error) {
        window.alert(`공간 메모 저장에 실패했습니다.\n${error.message}`);
      } finally {
        saveButton.disabled = false;
      }
    });

    elements.manageSpacesList.append(wrapper);
  });
}

function renderHistory() {
  const logs = state.bootstrap.activity_logs ?? [];
  const limit = Number(state.bootstrap.app_settings?.history_limit ?? 10);
  elements.historySummary.innerHTML = `
    <strong>보관 개수</strong>: 최근 ${limit}건
    <br />
    <strong>현재 기록 수</strong>: ${logs.length}건
  `;

  if (!logs.length) {
    elements.historyList.innerHTML =
      '<div class="empty-state">체크 또는 메모를 남기면 최근 기록이 여기에 표시됩니다.</div>';
    return;
  }

  elements.historyList.innerHTML = logs
    .map(
      (log) => `
        <article class="history-item">
          <div class="history-item__top">
            <h4>${escapeHtml(log.space_name)}</h4>
            <span class="history-badge" data-kind="${escapeHtml(log.entry_type)}">
              ${log.entry_type === "check" ? "확인" : "메모"}
            </span>
          </div>
          <p class="history-item__meta">
            ${escapeHtml(log.employee_name)} · ${formatKoreanDateTime(log.created_at, config.timezone || "Asia/Seoul")}
          </p>
          <p class="history-item__body">${escapeHtml(log.memo || "확인 완료")}</p>
        </article>
      `,
    )
    .join("");
}

function renderSettings() {
  elements.historyLimit.value = String(state.bootstrap.app_settings?.history_limit ?? 10);
}

function bindTabs() {
  elements.tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const name = tab.dataset.tab;
      elements.tabs.forEach((item) => item.classList.toggle("is-active", item === tab));
      elements.panels.forEach((panel) =>
        panel.classList.toggle("is-active", panel.dataset.panel === name),
      );
    });
  });
}

function bindForms() {
  elements.employeeSelect.addEventListener("change", (event) => {
    state.selectedEmployeeId = event.target.value;
  });

  elements.employeeForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = elements.employeeName.value.trim();
    if (!name) return;

    try {
      const employee = await state.repository.addEmployee(name);
      state.selectedEmployeeId = employee.id;
      elements.employeeName.value = "";
      await refresh();
    } catch (error) {
      window.alert(`직원 추가에 실패했습니다.\n${error.message}`);
    }
  });

  elements.spaceForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = elements.spaceName.value.trim();
    if (!name) return;

    try {
      await state.repository.addSpace(name);
      elements.spaceName.value = "";
      await refresh();
    } catch (error) {
      window.alert(`공간 추가에 실패했습니다.\n${error.message}`);
    }
  });

  elements.settingsForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const historyLimit = Number(elements.historyLimit.value);
    if (!Number.isFinite(historyLimit) || historyLimit < 1) {
      window.alert("보관 개수는 1 이상 숫자로 입력해 주세요.");
      return;
    }

    try {
      await state.repository.updateSettings({ history_limit: historyLimit });
      await refresh();
    } catch (error) {
      window.alert(`설정 저장에 실패했습니다.\n${error.message}`);
    }
  });
}

async function init() {
  state.repository = await createRepository();
  bindTabs();
  bindForms();
  await refresh();
}

init().catch((error) => {
  console.error(error);
  window.alert(`앱 초기화에 실패했습니다.\n${error.message}`);
});

