import { createLocalRepository } from "./storage.js";
import { createSupabaseRepository } from "./supabase.js";
import {
  addMonths,
  buildCalendarDays,
  escapeHtml,
  formatKoreanDate,
  formatKoreanDateTime,
  formatYearMonth,
  getWorkDate,
} from "./utils.js";

const config = window.__APP_CONFIG__ ?? {};

const state = {
  bootstrap: null,
  selectedEmployeeId: "",
  selectedChecklistType: "open",
  selectedDate: getWorkDate(config.timezone || "Asia/Seoul"),
  calendarMonth: new Date(),
  repository: null,
};

let elements = {};

function initializeElements() {
  elements = {
    title: document.getElementById("app-title"),
    todayLabel: document.getElementById("today-label"),
    syncPill: document.getElementById("sync-pill"),
    employeeCard: document.getElementById("employee-card"),
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
    calendarGrid: document.getElementById("calendar-grid"),
    calendarLabel: document.getElementById("calendar-label"),
    calendarPrev: document.getElementById("calendar-prev"),
    calendarNext: document.getElementById("calendar-next"),
    settingsForm: document.getElementById("settings-form"),
    historyLimit: document.getElementById("history-limit"),
    showEmployeeToggle: document.getElementById("show-employee-toggle"),
    setupStatus: document.getElementById("setup-status"),
    template: document.getElementById("space-card-template"),
    tabs: Array.from(document.querySelectorAll(".tab")),
    panels: Array.from(document.querySelectorAll(".panel")),
    checklistTabs: Array.from(document.querySelectorAll(".hero-tab")),
    checklistTitle: document.getElementById("checklist-title"),
    checklistDescription: document.getElementById("checklist-description"),
    summaryCount: document.getElementById("summary-count"),
    summaryCaption: document.getElementById("summary-caption"),
    finalizeButton: document.getElementById("finalize-button"),
  };
}

function setText(element, value) {
  if (element) {
    element.textContent = value;
  }
}

function setHtml(element, value) {
  if (element) {
    element.innerHTML = value;
  }
}

function toggleClass(element, className, enabled) {
  if (element) {
    element.classList.toggle(className, enabled);
  }
}

function canUseSupabase() {
  return Boolean(config.useSupabase && config.supabaseUrl && config.supabaseAnonKey);
}

function getErrorMessage(error) {
  if (!error) return "알 수 없는 오류";
  if (typeof error === "string") return error;
  return error.message || "알 수 없는 오류";
}

function isMissingSupabaseTable(error) {
  const message = getErrorMessage(error);
  return message.includes("Could not find the table") || message.includes("PGRST205");
}

function buildSupabaseSchemaHelp() {
  return [
    "현재 연결된 Supabase 프로젝트에 필요한 테이블이 없습니다.",
    "Supabase SQL Editor에서 `supabase/schema.sql` 내용을 실행한 뒤 새로고침해 주세요.",
    `연결된 프로젝트: ${config.supabaseUrl || "미설정"}`,
  ].join("\n");
}

function showSchemaHelp(error) {
  const message = `${buildSupabaseSchemaHelp()}\n\n원본 오류:\n${getErrorMessage(error)}`;
  setText(elements.setupStatus, message);
  window.alert(message);
}

async function createRepository() {
  if (canUseSupabase()) {
    return createSupabaseRepository(config);
  }
  return createLocalRepository(config.timezone || "Asia/Seoul");
}

function getSettings() {
  return (
    state.bootstrap?.app_settings ?? {
      history_limit: 10,
      timezone: "Asia/Seoul",
      show_employee_name: true,
    }
  );
}

function showEmployeeName() {
  return Boolean(getSettings().show_employee_name);
}

function getSelectedEmployee() {
  return state.bootstrap?.employees.find((item) => item.id === state.selectedEmployeeId) ?? null;
}

function getCurrentCheck(spaceId, checklistType = state.selectedChecklistType) {
  return (
    state.bootstrap?.current_checks.find(
      (item) =>
        item.space_id === spaceId &&
        item.checklist_type === checklistType &&
        item.work_date === getWorkDate(config.timezone || "Asia/Seoul"),
    ) ?? null
  );
}

function getChecklistLabel(type = state.selectedChecklistType) {
  return type === "open" ? "오픈" : "마감";
}

function getChecklistTemplate(space, type = state.selectedChecklistType) {
  return type === "open" ? space.open_checklist_template : space.close_checklist_template;
}

function getArchivedChecksForDate(dateKey) {
  return (state.bootstrap?.archived_checks ?? []).filter((item) => item.archive_date === dateKey);
}

async function refresh() {
  state.bootstrap = await state.repository.getBootstrap();
  const activeEmployees = state.bootstrap.employees ?? [];
  if (!activeEmployees.some((item) => item.id === state.selectedEmployeeId)) {
    state.selectedEmployeeId = activeEmployees[0]?.id ?? "";
  }

  renderHeader();
  renderChecklistTabs();
  renderEmployees();
  renderChecklistSummary();
  renderSpaces();
  renderManageSpaces();
  renderHistory();
  renderSettings();
}

function renderHeader() {
  setText(elements.title, config.appName || "병원 체크리스트");
  setText(elements.todayLabel, formatKoreanDate(new Date(), config.timezone || "Asia/Seoul"));
  setText(elements.syncPill, canUseSupabase() ? "Supabase 연결됨" : "데모 모드");
  setText(
    elements.setupStatus,
    canUseSupabase()
      ? "현재 Supabase 연결 설정이 켜져 있습니다. 실제 DB에 저장됩니다."
      : "`site/app-config.js`에 Supabase 값을 넣기 전까지는 브라우저 로컬 저장소를 사용합니다.",
  );
}

function renderChecklistTabs() {
  const checklistName = getChecklistLabel();
  setText(elements.checklistTitle, `${checklistName} 공간 점검`);
  setText(
    elements.checklistDescription,
    state.selectedChecklistType === "open"
      ? "오픈 준비에 필요한 공간별 확인 여부와 메모를 관리합니다."
      : "마감 확인에 필요한 공간별 상태와 메모를 관리합니다.",
  );

  elements.checklistTabs.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.checklistType === state.selectedChecklistType);
  });
}

function renderEmployees() {
  const employees = state.bootstrap?.employees ?? [];
  const shouldShowEmployee = showEmployeeName();

  toggleClass(elements.employeeCard, "is-hidden", !shouldShowEmployee);
  if (elements.employeeSelect) elements.employeeSelect.innerHTML = "";

  if (!shouldShowEmployee) {
    setHtml(
      elements.employeeList,
      employees.length
      ? employees.map((employee) => `<span class="chip">${escapeHtml(employee.name)}</span>`).join("")
      : '<div class="empty-state">직원 목록은 저장되어 있지만 현재 표시하지 않도록 설정되어 있습니다.</div>',
    );
    return;
  }

  if (!employees.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "직원을 먼저 추가해 주세요";
    if (elements.employeeSelect) {
      elements.employeeSelect.append(option);
      elements.employeeSelect.disabled = true;
    }
    setText(elements.employeeHelp, "관리 탭에서 직원을 추가하면 여기에서 선택할 수 있습니다.");
    setHtml(elements.employeeList, '<div class="empty-state">아직 등록된 직원이 없습니다.</div>');
    return;
  }

  if (elements.employeeSelect) elements.employeeSelect.disabled = false;
  setText(elements.employeeHelp, "현재 선택한 직원 이름은 체크와 메모에 함께 저장됩니다.");
  employees.forEach((employee) => {
    const option = document.createElement("option");
    option.value = employee.id;
    option.textContent = employee.name;
    option.selected = employee.id === state.selectedEmployeeId;
    if (elements.employeeSelect) elements.employeeSelect.append(option);
  });

  setHtml(
    elements.employeeList,
    employees.map((employee) => `<span class="chip">${escapeHtml(employee.name)}</span>`).join(""),
  );
}

function renderChecklistSummary() {
  const spaces = state.bootstrap?.spaces ?? [];
  const checkedCount = spaces.filter((space) => getCurrentCheck(space.id)?.checked).length;
  const checklistName = getChecklistLabel();

  setText(elements.summaryCount, `${checkedCount} / ${spaces.length} 공간 확인 완료`);
  setText(
    elements.summaryCaption,
    `오늘 ${checklistName} 체크의 최종 결과만 기록으로 넘기고, 넘긴 뒤 현재 상태는 초기화됩니다.`,
  );
  setText(elements.finalizeButton, `오늘 ${checklistName} 결과 기록으로 넘기기`);
}

function buildOwnerText(currentCheck) {
  if (!showEmployeeName()) return "";
  if (!currentCheck?.employee_name) return "담당 직원 없음";
  return `기록 직원: ${currentCheck.employee_name}`;
}

function buildDetailsBadges(currentCheck, templateText) {
  const badges = [];
  if ((templateText ?? "").trim()) {
    badges.push('<span class="summary-badge">체크항목 있음</span>');
  }
  if ((currentCheck?.comment ?? "").trim()) {
    badges.push('<span class="summary-badge is-warning">메모 있음</span>');
  }
  return badges.join("");
}

function renderSpaces() {
  const spaces = state.bootstrap?.spaces ?? [];
  if (elements.spacesList) elements.spacesList.innerHTML = "";

  if (!spaces.length) {
    setHtml(elements.spacesList, '<div class="empty-state">공간을 추가하면 이곳에 점검 카드가 표시됩니다.</div>');
    return;
  }

  spaces.forEach((space) => {
    const currentCheck = getCurrentCheck(space.id);
    const rawTemplateText = getChecklistTemplate(space)?.trim() ?? "";
    const templateText = rawTemplateText || "아직 등록된 체크 항목이 없습니다.";
    const fragment = elements.template.content.cloneNode(true);
    const card = fragment.querySelector(".space-card");
    const name = fragment.querySelector(".space-card__name");
    const confirmButton = fragment.querySelector('[data-action="toggle-check"]');
    const template = fragment.querySelector(".space-card__template");
    const commentInput = fragment.querySelector(".space-card__comment");
    const saveCommentButton = fragment.querySelector('[data-action="save-comment"]');
    const clearCommentButton = fragment.querySelector('[data-action="clear-comment"]');
    const checkState = fragment.querySelector('[data-role="check-state"]');
    const commentState = fragment.querySelector('[data-role="comment-state"]');
    const ownerState = fragment.querySelector('[data-role="owner-state"]');
    const summaryBadges = fragment.querySelector('[data-role="summary-badges"]');

    const hasComment = Boolean(currentCheck?.comment?.trim());
    const isChecked = Boolean(currentCheck?.checked);

    name.textContent = space.name;
    template.textContent = templateText;
    commentInput.value = currentCheck?.comment ?? "";
    summaryBadges.innerHTML = buildDetailsBadges(currentCheck, rawTemplateText);

    card.classList.toggle("is-checked", isChecked);
    card.classList.toggle("has-comment", hasComment);

    confirmButton.textContent = isChecked ? "확인 완료" : "확인";
    confirmButton.classList.toggle("is-complete", isChecked);

    checkState.textContent = isChecked ? "확인됨" : "미확인";
    checkState.classList.toggle("is-warning", !isChecked);

    commentState.textContent = hasComment ? "메모 있음" : "메모 없음";
    commentState.classList.toggle("is-warning", hasComment);

    ownerState.textContent = buildOwnerText(currentCheck);

    confirmButton.addEventListener("click", async () => {
      try {
        const employee = getSelectedEmployee();
        if (showEmployeeName() && !employee) {
          window.alert("먼저 직원을 선택해 주세요.");
          return;
        }

        confirmButton.disabled = true;
        await state.repository.saveCurrentCheck({
          checklist_type: state.selectedChecklistType,
          space_id: space.id,
          space_name: space.name,
          checked: !isChecked,
          employee_id: showEmployeeName() ? employee?.id ?? null : null,
          employee_name: showEmployeeName() ? employee?.name ?? "" : "",
        });
        await refresh();
      } catch (error) {
        if (isMissingSupabaseTable(error)) {
          showSchemaHelp(error);
          return;
        }
        window.alert(`확인 상태 저장에 실패했습니다.\n${getErrorMessage(error)}`);
      } finally {
        confirmButton.disabled = false;
      }
    });

    saveCommentButton.addEventListener("click", async () => {
      try {
        const memo = commentInput.value.trim();
        const employee = getSelectedEmployee();

        if (showEmployeeName() && !employee) {
          window.alert("먼저 직원을 선택해 주세요.");
          return;
        }

        saveCommentButton.disabled = true;
        await state.repository.saveCurrentCheck({
          checklist_type: state.selectedChecklistType,
          space_id: space.id,
          space_name: space.name,
          comment: memo,
          employee_id: showEmployeeName() ? employee?.id ?? null : null,
          employee_name: showEmployeeName() ? employee?.name ?? "" : "",
        });
        await refresh();
      } catch (error) {
        if (isMissingSupabaseTable(error)) {
          showSchemaHelp(error);
          return;
        }
        window.alert(`메모 저장에 실패했습니다.\n${getErrorMessage(error)}`);
      } finally {
        saveCommentButton.disabled = false;
      }
    });

    clearCommentButton.addEventListener("click", async () => {
      try {
        clearCommentButton.disabled = true;
        await state.repository.clearCurrentComment({
          checklistType: state.selectedChecklistType,
          spaceId: space.id,
        });
        await refresh();
      } catch (error) {
        if (isMissingSupabaseTable(error)) {
          showSchemaHelp(error);
          return;
        }
        window.alert(`메모 삭제에 실패했습니다.\n${getErrorMessage(error)}`);
      } finally {
        clearCommentButton.disabled = false;
      }
    });

    if (elements.spacesList) elements.spacesList.append(card);
  });
}

function renderManageSpaces() {
  const spaces = state.bootstrap?.spaces ?? [];
  if (elements.manageSpacesList) elements.manageSpacesList.innerHTML = "";

  if (!spaces.length) {
    setHtml(
      elements.manageSpacesList,
      '<div class="empty-state">공간을 추가하면 이곳에서 체크 항목과 순서를 편집할 수 있습니다.</div>',
    );
    return;
  }

  spaces.forEach((space, index) => {
    const wrapper = document.createElement("article");
    wrapper.className = "manage-space-card";
    wrapper.innerHTML = `
      <div class="manage-space-card__top">
        <h4>${escapeHtml(space.name)}</h4>
        <span class="chip">순서 ${space.sort_order ?? "-"}</span>
      </div>
      <div class="manage-space-card__order">
        <button class="secondary-button" data-role="move-up" ${index === 0 ? "disabled" : ""}>위로</button>
        <button class="secondary-button" data-role="move-down" ${index === spaces.length - 1 ? "disabled" : ""}>아래로</button>
      </div>
      <label class="field">
        <span class="field__label">오픈 체크 항목</span>
        <textarea rows="4" data-role="open-template">${escapeHtml(space.open_checklist_template ?? "")}</textarea>
      </label>
      <label class="field">
        <span class="field__label">마감 체크 항목</span>
        <textarea rows="4" data-role="close-template">${escapeHtml(space.close_checklist_template ?? "")}</textarea>
      </label>
      <div class="space-card__actions">
        <button class="secondary-button" data-role="save-space">공간 설정 저장</button>
      </div>
    `;

    const openInput = wrapper.querySelector('[data-role="open-template"]');
    const closeInput = wrapper.querySelector('[data-role="close-template"]');
    const saveButton = wrapper.querySelector('[data-role="save-space"]');
    const moveUp = wrapper.querySelector('[data-role="move-up"]');
    const moveDown = wrapper.querySelector('[data-role="move-down"]');

    saveButton.addEventListener("click", async () => {
      try {
        saveButton.disabled = true;
        await state.repository.updateSpace(space.id, {
          open_checklist_template: openInput.value.trim(),
          close_checklist_template: closeInput.value.trim(),
        });
        await refresh();
      } catch (error) {
        if (isMissingSupabaseTable(error)) {
          showSchemaHelp(error);
          return;
        }
        window.alert(`공간 설정 저장에 실패했습니다.\n${getErrorMessage(error)}`);
      } finally {
        saveButton.disabled = false;
      }
    });

    moveUp.addEventListener("click", async () => {
      try {
        await state.repository.reorderSpace(space.id, "up");
        await refresh();
      } catch (error) {
        window.alert(`공간 순서 변경에 실패했습니다.\n${getErrorMessage(error)}`);
      }
    });

    moveDown.addEventListener("click", async () => {
      try {
        await state.repository.reorderSpace(space.id, "down");
        await refresh();
      } catch (error) {
        window.alert(`공간 순서 변경에 실패했습니다.\n${getErrorMessage(error)}`);
      }
    });

    if (elements.manageSpacesList) elements.manageSpacesList.append(wrapper);
  });
}

function renderHistory() {
  const archives = state.bootstrap?.archived_checks ?? [];
  const days = buildCalendarDays(state.calendarMonth);
  const archiveMap = new Map();

  archives.forEach((item) => {
    const list = archiveMap.get(item.archive_date) ?? [];
    list.push(item);
    archiveMap.set(item.archive_date, list);
  });

  setText(elements.calendarLabel, formatYearMonth(state.calendarMonth));
  setText(elements.historySummary, `보관 중인 날짜 수: ${[...new Set(archives.map((item) => item.archive_date))].length}일`);

  setHtml(
    elements.calendarGrid,
    days
    .map((day) => {
      const entries = archiveMap.get(day.key) ?? [];
      const openCount = entries.filter((item) => item.checklist_type === "open").length;
      const closeCount = entries.filter((item) => item.checklist_type === "close").length;
      const classes = [
        "calendar-day",
        day.inMonth ? "" : "is-muted",
        state.selectedDate === day.key ? "is-selected" : "",
      ]
        .filter(Boolean)
        .join(" ");

      return `
        <button class="${classes}" data-date="${day.key}" type="button">
          <div class="calendar-day__number">${day.day}</div>
          <div class="calendar-day__meta">
            ${openCount ? `<span class="helper-text"><span class="calendar-dot"></span> 오픈 ${openCount}</span>` : ""}
            ${closeCount ? `<span class="helper-text"><span class="calendar-dot is-close"></span> 마감 ${closeCount}</span>` : ""}
          </div>
        </button>
      `;
    })
    .join(""),
  );

  Array.from(elements.calendarGrid?.querySelectorAll("[data-date]") ?? []).forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedDate = button.dataset.date;
      renderHistory();
    });
  });

  const selectedEntries = (archiveMap.get(state.selectedDate) ?? []).sort((a, b) => {
    if (a.checklist_type === b.checklist_type) return Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0);
    return a.checklist_type === "open" ? -1 : 1;
  });

  if (!selectedEntries.length) {
    setHtml(elements.historyList, `<div class="empty-state">${state.selectedDate} 기록이 없습니다.</div>`);
    return;
  }

  setHtml(
    elements.historyList,
    selectedEntries.map((item) => {
      const commentText = item.comment?.trim() ? item.comment : "메모 없음";
      const ownerText =
        showEmployeeName() && item.employee_name
          ? `${escapeHtml(item.employee_name)} · `
          : "";

      return `
        <article class="history-item">
          <div class="history-item__top">
            <h4>${escapeHtml(item.space_name)}</h4>
            <span class="history-badge" data-kind="${escapeHtml(item.checklist_type)}">
              ${item.checklist_type === "open" ? "오픈" : "마감"}
            </span>
          </div>
          <p class="history-item__meta">
            ${item.checked ? "확인 완료" : "미확인"} · ${ownerText}${formatKoreanDateTime(item.archived_at, config.timezone || "Asia/Seoul")}
          </p>
          <p class="history-item__body">${escapeHtml(commentText)}</p>
        </article>
      `;
    }).join(""),
  );
}

function renderSettings() {
  const settings = getSettings();
  if (elements.historyLimit) elements.historyLimit.value = String(settings.history_limit ?? 10);
  if (elements.showEmployeeToggle) elements.showEmployeeToggle.checked = Boolean(settings.show_employee_name);
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

  elements.checklistTabs.forEach((button) => {
    button.addEventListener("click", async () => {
      state.selectedChecklistType = button.dataset.checklistType;
      renderChecklistTabs();
      renderChecklistSummary();
      renderSpaces();
    });
  });
}

function bindForms() {
  elements.employeeSelect?.addEventListener("change", (event) => {
    state.selectedEmployeeId = event.target.value;
  });

  elements.employeeForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = elements.employeeName.value.trim();
    if (!name) return;

    try {
      const employee = await state.repository.addEmployee(name);
      state.selectedEmployeeId = employee.id;
      elements.employeeName.value = "";
      await refresh();
    } catch (error) {
      if (isMissingSupabaseTable(error)) {
        showSchemaHelp(error);
        return;
      }
      window.alert(`직원 추가에 실패했습니다.\n${getErrorMessage(error)}`);
    }
  });

  elements.spaceForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = elements.spaceName.value.trim();
    if (!name) return;

    try {
      await state.repository.addSpace(name);
      elements.spaceName.value = "";
      await refresh();
    } catch (error) {
      if (isMissingSupabaseTable(error)) {
        showSchemaHelp(error);
        return;
      }
      window.alert(`공간 추가에 실패했습니다.\n${getErrorMessage(error)}`);
    }
  });

  elements.settingsForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const historyLimit = Number(elements.historyLimit.value);
    if (!Number.isFinite(historyLimit) || historyLimit < 1) {
      window.alert("기록 보관 날짜 수는 1 이상 숫자로 입력해 주세요.");
      return;
    }

    try {
      await state.repository.updateSettings({
        history_limit: historyLimit,
        show_employee_name: Boolean(elements.showEmployeeToggle?.checked),
      });
      await refresh();
    } catch (error) {
      if (isMissingSupabaseTable(error)) {
        showSchemaHelp(error);
        return;
      }
      window.alert(`설정 저장에 실패했습니다.\n${getErrorMessage(error)}`);
    }
  });

  elements.finalizeButton?.addEventListener("click", async () => {
    const checklistName = getChecklistLabel();
    const confirmed = window.confirm(
      `오늘 ${checklistName} 체크 최종 결과를 기록으로 넘기고 현재 상태를 초기화할까요?`,
    );
    if (!confirmed) return;

    try {
      elements.finalizeButton.disabled = true;
      await state.repository.finalizeChecklist({
        checklistType: state.selectedChecklistType,
      });
      state.selectedDate = getWorkDate(config.timezone || "Asia/Seoul");
      await refresh();
    } catch (error) {
      if (isMissingSupabaseTable(error)) {
        showSchemaHelp(error);
        return;
      }
      window.alert(`최종 기록 저장에 실패했습니다.\n${getErrorMessage(error)}`);
    } finally {
      elements.finalizeButton.disabled = false;
    }
  });

  elements.calendarPrev?.addEventListener("click", () => {
    state.calendarMonth = addMonths(state.calendarMonth, -1);
    renderHistory();
  });

  elements.calendarNext?.addEventListener("click", () => {
    state.calendarMonth = addMonths(state.calendarMonth, 1);
    renderHistory();
  });
}

async function init() {
  try {
    initializeElements();
    state.repository = await createRepository();
    bindTabs();
    bindForms();
    await refresh();
  } catch (error) {
    if (isMissingSupabaseTable(error)) {
      showSchemaHelp(error);
      return;
    }
    throw error;
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    init().catch((error) => {
      console.error(error);
      window.alert(`앱 초기화에 실패했습니다.\n${getErrorMessage(error)}`);
    });
  });
} else {
  init().catch((error) => {
    console.error(error);
    window.alert(`앱 초기화에 실패했습니다.\n${getErrorMessage(error)}`);
  });
}
