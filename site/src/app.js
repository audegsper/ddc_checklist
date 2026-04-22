import { createLocalRepository } from "./storage.js";
import { createSupabaseRepository } from "./supabase.js";
import {
  addMonths,
  buildCalendarDays,
  escapeHtml,
  formatKoreanDate,
  formatKoreanDateTime,
  formatYearMonth,
  getTimePartsInTimeZone,
  getWorkDate,
} from "./utils.js";

const APP_VERSION = "버전 1.1.1";
const APP_DISPLAY_NAME = "DD 체크리스트";
const config = window.__APP_CONFIG__ ?? {};
const APP_TIMEZONE = config.timezone || "Asia/Seoul";
const OPEN_ALERT_STORAGE_KEY = "ddc-checklist-open-alert-date";
const CHECKLIST_TYPES = [
  { id: "open", label: "오픈", templateKey: "open_checklist_template" },
  { id: "always", label: "상시", templateKey: "always_checklist_template" },
  { id: "close", label: "마감", templateKey: "close_checklist_template" },
];

function getChecklistTypeByTime(date = new Date()) {
  const { hour } = getTimePartsInTimeZone(APP_TIMEZONE, date);
  if (hour < 13) return "open";
  if (hour < 18) return "always";
  return "close";
}

const state = {
  bootstrap: null,
  selectedEmployeeId: "",
  selectedChecklistType: getChecklistTypeByTime(),
  selectedDate: getWorkDate(APP_TIMEZONE),
  calendarMonth: new Date(),
  repository: null,
  setupUnlocked: false,
  activePanel: "checklist",
  lastPrimaryPanel: "checklist",
  selectedManageSpaceId: "",
  draggedEmployeeId: null,
  commentDrafts: {},
  openDetails: {},
  manageOpenDetails: {},
  openAlertTimer: null,
  hasBootstrapped: false,
};

let elements = {};

function initializeElements() {
  elements = {
    loading: document.getElementById("app-loading"),
    loadingText: document.getElementById("app-loading-text"),
    title: document.getElementById("app-title"),
    panelDate: document.getElementById("panel-date"),
    versionPill: document.getElementById("version-pill"),
    setupOpenButton: document.getElementById("setup-open-button"),
    setupCloseButton: document.getElementById("setup-close-button"),
    employeeButtons: document.getElementById("employee-buttons"),
    spacesList: document.getElementById("spaces-list"),
    employeeForm: document.getElementById("employee-form"),
    employeeName: document.getElementById("employee-name"),
    employeeList: document.getElementById("employee-list"),
    spaceForm: document.getElementById("space-form"),
    spaceName: document.getElementById("space-name"),
    manageSpacesList: document.getElementById("manage-spaces-list"),
    manageSpaceSelection: document.getElementById("manage-space-selection"),
    spaceMoveUp: document.getElementById("space-move-up"),
    spaceMoveDown: document.getElementById("space-move-down"),
    historyList: document.getElementById("history-list"),
    historySummary: document.getElementById("history-summary"),
    historyRetentionCopy: document.getElementById("history-retention-copy"),
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
    checklistTabs: Array.from(document.querySelectorAll("[data-checklist-type]")),
    checklistTitle: document.getElementById("checklist-title"),
    checklistDescription: document.getElementById("checklist-description"),
    summaryCount: document.getElementById("summary-count"),
    summaryCaption: document.getElementById("summary-caption"),
    openOverview: document.getElementById("open-overview"),
    alwaysOverview: document.getElementById("always-overview"),
    closeOverview: document.getElementById("close-overview"),
    openOverviewCount: document.getElementById("open-overview-count"),
    alwaysOverviewCount: document.getElementById("always-overview-count"),
    closeOverviewCount: document.getElementById("close-overview-count"),
    setupLockCard: document.getElementById("setup-lock-card"),
    setupContent: document.getElementById("setup-content"),
    setupAuthForm: document.getElementById("setup-auth-form"),
    setupPassword: document.getElementById("setup-password"),
    setupAuthHelp: document.getElementById("setup-auth-help"),
    setupLockButton: document.getElementById("setup-lock-button"),
    passwordForm: document.getElementById("password-form"),
    currentPassword: document.getElementById("current-password"),
    newPassword: document.getElementById("new-password"),
  };
}

function setText(element, value) {
  if (element) element.textContent = value;
}

function setHtml(element, value) {
  if (element) element.innerHTML = value;
}

function toggleClass(element, className, enabled) {
  if (element) element.classList.toggle(className, enabled);
}

function setLoading(visible, text = "데이터를 불러오는 중입니다.") {
  toggleClass(elements.loading, "is-hidden", !visible);
  setText(elements.loadingText, text);
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
    "Supabase SQL Editor에서 `supabase/schema.sql` 내용을 다시 실행한 뒤 새로고침해 주세요.",
    `연결된 프로젝트: ${config.supabaseUrl || "미설정"}`,
  ].join("\n");
}

function showSchemaHelp(error) {
  const message = `${buildSupabaseSchemaHelp()}\n\n원본 오류:\n${getErrorMessage(error)}`;
  setText(elements.setupStatus, message);
  window.alert(message);
}

function getSettings() {
  return (
    state.bootstrap?.app_settings ?? {
      history_limit: 10,
      timezone: APP_TIMEZONE,
      show_employee_name: true,
      admin_password: "8883",
      last_daily_archive_date: null,
    }
  );
}

function currentFocusType() {
  return getChecklistTypeByTime();
}

async function createRepository() {
  if (canUseSupabase()) return createSupabaseRepository(config);
  return createLocalRepository(APP_TIMEZONE);
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
        item.work_date === getWorkDate(APP_TIMEZONE),
    ) ?? null
  );
}

function getCurrentComments(spaceId) {
  return (state.bootstrap?.current_comments ?? [])
    .filter(
      (item) =>
        item.space_id === spaceId &&
        item.work_date === getWorkDate(APP_TIMEZONE),
    )
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
}

function getArchivedComments(archiveDate, spaceId) {
  return (state.bootstrap?.archived_comments ?? [])
    .filter(
      (item) =>
        item.archive_date === archiveDate &&
        item.space_id === spaceId,
    )
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
}

function getChecklistLabel(type = state.selectedChecklistType) {
  return CHECKLIST_TYPES.find((item) => item.id === type)?.label ?? "오픈";
}

function getChecklistConfig(type = state.selectedChecklistType) {
  return CHECKLIST_TYPES.find((item) => item.id === type) ?? CHECKLIST_TYPES[0];
}

function getChecklistTemplate(space, type = state.selectedChecklistType) {
  return space?.[getChecklistConfig(type).templateKey] ?? "";
}

function getChecklistItems(space, type = state.selectedChecklistType) {
  return getChecklistTemplate(space, type)
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

function countChecklistStatus(type) {
  const spaces = state.bootstrap?.spaces ?? [];
  const checked = spaces.filter((space) => getCurrentCheck(space.id, type)?.checked).length;
  return {
    checked,
    unchecked: Math.max(spaces.length - checked, 0),
  };
}

function sortChecklistSpaces(spaces) {
  return [...spaces].sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0));
}

function getCommentDraftKey(spaceId) {
  return String(spaceId);
}

function getCommentDraft(spaceId) {
  return (
    state.commentDrafts[getCommentDraftKey(spaceId)] ?? {
      text: "",
      editingCommentId: null,
    }
  );
}

function setCommentDraft(spaceId, patch) {
  const key = getCommentDraftKey(spaceId);
  state.commentDrafts[key] = {
    ...getCommentDraft(spaceId),
    ...patch,
  };
}

function clearCommentDraft(spaceId) {
  delete state.commentDrafts[getCommentDraftKey(spaceId)];
}

function getOpenDetailsType(spaceId) {
  return state.openDetails[spaceId] ?? "";
}

function setOpenDetailsType(spaceId, checklistType = "") {
  if (checklistType) {
    state.openDetails[spaceId] = checklistType;
    return;
  }
  delete state.openDetails[spaceId];
}

function isManageDetailsOpen(spaceId) {
  return Boolean(state.manageOpenDetails[spaceId]);
}

function setManageDetailsOpen(spaceId, open) {
  state.manageOpenDetails[spaceId] = open;
}

function buildChecklistPrompt(space, checklistType, isChecked) {
  const checklistLabel = getChecklistLabel(checklistType);
  if (isChecked) {
    return `${space.name} 공간의 ${checklistLabel} 확인 완료를 해제할까요?\n\n해제하면 다시 '체크가 필요한 곳'으로 이동합니다.`;
  }

  const items = getChecklistItems(space, checklistType);
  const itemLines = items.length
    ? items.map((item, index) => `${index + 1}. ${item}`).join("\n")
    : "등록된 체크 항목이 없습니다.";

  return [
    `${space.name} 공간의 ${checklistLabel} 체크 항목입니다.`,
    "",
    itemLines,
    "",
    "위 항목을 모두 확인했다면 확인을 눌러 주세요.",
  ].join("\n");
}

function buildOwnerText(currentCheck) {
  if (!getSettings().show_employee_name) return "";
  if (!currentCheck?.employee_name) return "";
  return `확인 직원: ${currentCheck.employee_name}`;
}

function renderChecklistItemsMarkup(space, checklistType = state.selectedChecklistType) {
  const items = getChecklistItems(space, checklistType);
  if (!items.length) {
    return '<p class="helper-text">등록된 체크 항목이 없습니다.</p>';
  }

  return `
    <ul class="checklist-item-list__items">
      ${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
    </ul>
  `;
}

function canEditComment(comment) {
  return Boolean(state.selectedEmployeeId && comment.employee_id && comment.employee_id === state.selectedEmployeeId);
}

function renderCurrentCommentsMarkup(comments) {
  if (!comments.length) {
    return '<div class="empty-inline">등록된 메모가 없습니다.</div>';
  }

  return comments
    .map((comment) => {
      const actions = canEditComment(comment)
        ? `
            <div class="comment-item__actions">
              <button class="tiny-button" data-action="edit-comment" data-comment-id="${escapeHtml(comment.id)}" type="button">수정</button>
              <button class="tiny-button is-danger" data-action="delete-comment" data-comment-id="${escapeHtml(comment.id)}" type="button">삭제</button>
            </div>
          `
        : "";

      return `
        <article class="comment-item">
          <div class="comment-item__top">
            <strong>${escapeHtml(comment.employee_name || "이름 없음")}</strong>
            <span class="helper-text">${escapeHtml(formatKoreanDateTime(comment.updated_at, APP_TIMEZONE))}</span>
          </div>
          <p class="comment-item__body">${escapeHtml(comment.content)}</p>
          ${actions}
        </article>
      `;
    })
    .join("");
}

function renderHistoryCommentsMarkup(comments) {
  if (!comments.length) {
    return '<div class="empty-inline">등록된 메모가 없습니다.</div>';
  }

  return comments
    .map(
      (comment) => `
        <article class="comment-item is-history">
          <div class="comment-item__top">
            <strong>${escapeHtml(comment.employee_name || "이름 없음")}</strong>
            <span class="helper-text">${escapeHtml(formatKoreanDateTime(comment.updated_at ?? comment.archived_at, APP_TIMEZONE))}</span>
          </div>
          <p class="comment-item__body">${escapeHtml(comment.content)}</p>
        </article>
      `,
    )
    .join("");
}

function measurePositions(container, selector, attributeName) {
  if (!container) return new Map();
  return new Map(
    Array.from(container.querySelectorAll(selector)).map((element) => [
      element.dataset[attributeName],
      element.getBoundingClientRect(),
    ]),
  );
}

async function animateListReorder(container, selector, attributeName, action) {
  const first = measurePositions(container, selector, attributeName);
  await action();
  const elementsToAnimate = Array.from(container?.querySelectorAll(selector) ?? []);
  elementsToAnimate.forEach((element) => {
    const key = element.dataset[attributeName];
    const previous = first.get(key);
    if (!previous) return;
    const next = element.getBoundingClientRect();
    const deltaX = previous.left - next.left;
    const deltaY = previous.top - next.top;
    if (!deltaX && !deltaY) return;
    element.animate(
      [
        { transform: `translate(${deltaX}px, ${deltaY}px)` },
        { transform: "translate(0, 0)" },
      ],
      { duration: 220, easing: "ease" },
    );
  });
}

async function refresh() {
  state.bootstrap = await state.repository.getBootstrap();

  const activeEmployees = state.bootstrap.employees ?? [];
  if (!activeEmployees.some((item) => item.id === state.selectedEmployeeId)) {
    state.selectedEmployeeId = "";
  }

  const activeSpaces = state.bootstrap.spaces ?? [];
  if (!activeSpaces.some((item) => item.id === state.selectedManageSpaceId)) {
    state.selectedManageSpaceId = "";
  }

  renderHeader();
  renderOverview();
  renderChecklistTabs();
  renderEmployees();
  renderChecklistSummary();
  renderSpaces();
  renderHistory();
  renderSettings();
  renderSetupAccess();
  activatePanel(state.activePanel);
  startOpenAlertWatcher();
  state.hasBootstrapped = true;
  setLoading(false);
}

function renderHeader() {
  setText(elements.title, APP_DISPLAY_NAME);
  setText(elements.panelDate, formatKoreanDate(new Date(), APP_TIMEZONE));
  setText(elements.versionPill, APP_VERSION);
  document.title = APP_DISPLAY_NAME;
  setText(
    elements.setupStatus,
    canUseSupabase()
      ? "현재 Supabase 연결 설정이 켜져 있습니다. 실제 DB에 저장됩니다."
      : "`site/app-config.js`에 Supabase 값을 넣기 전까지는 브라우저 로컬 저장소를 사용합니다.",
  );
}

function renderOverview() {
  const focus = currentFocusType();
  const openStats = countChecklistStatus("open");
  const alwaysStats = countChecklistStatus("always");
  const closeStats = countChecklistStatus("close");

  setText(elements.openOverviewCount, `확인 ${openStats.checked} · 미확인 ${openStats.unchecked}`);
  setText(elements.alwaysOverviewCount, `확인 ${alwaysStats.checked} · 미확인 ${alwaysStats.unchecked}`);
  setText(elements.closeOverviewCount, `확인 ${closeStats.checked} · 미확인 ${closeStats.unchecked}`);

  toggleClass(elements.openOverview, "is-hidden", focus !== "open");
  toggleClass(elements.alwaysOverview, "is-hidden", focus !== "always");
  toggleClass(elements.closeOverview, "is-hidden", focus !== "close");
  toggleClass(elements.openOverview, "is-active", focus === "open");
  toggleClass(elements.alwaysOverview, "is-active", focus === "always");
  toggleClass(elements.closeOverview, "is-active", focus === "close");
}

function renderChecklistTabs() {
  const checklistName = getChecklistLabel();
  setText(elements.checklistTitle, `${checklistName} 체크리스트`);
  setText(elements.checklistDescription, "");

  elements.checklistTabs.forEach((button) => {
    if (!button.dataset.checklistType) return;
    button.classList.toggle("is-active", button.dataset.checklistType === state.selectedChecklistType);
  });
}

function renderEmployees() {
  const employees = state.bootstrap?.employees ?? [];
  if (elements.employeeButtons) elements.employeeButtons.innerHTML = "";

  if (!employees.length) {
    setHtml(elements.employeeButtons, '<span class="chip chip--muted">등록된 직원 없음</span>');
    return;
  }

  setHtml(
    elements.employeeButtons,
    employees
      .map(
        (employee) => `
          <button
            class="chip employee-choice ${employee.id === state.selectedEmployeeId ? "is-active" : ""}"
            data-employee-id="${escapeHtml(employee.id)}"
            type="button"
          >
            ${escapeHtml(employee.name)}
          </button>
        `,
      )
      .join(""),
  );

  Array.from(elements.employeeButtons?.querySelectorAll("[data-employee-id]") ?? []).forEach((button) => {
    button.addEventListener("click", () => {
      const employeeId = button.dataset.employeeId ?? "";
      state.selectedEmployeeId = state.selectedEmployeeId === employeeId ? "" : employeeId;
      renderEmployees();
      renderSpaces();
    });
  });
}

function renderChecklistSummary() {
  const spaces = state.bootstrap?.spaces ?? [];
  const checkedCount = spaces.filter((space) => getCurrentCheck(space.id, state.selectedChecklistType)?.checked).length;
  const uncheckedCount = Math.max(spaces.length - checkedCount, 0);

  setText(elements.summaryCount, `체크가 필요한 곳 ${uncheckedCount} · 체크를 완료한 곳 ${checkedCount}`);
  setText(elements.summaryCaption, "");
}

function buildSpaceCard(space) {
  const fragment = elements.template.content.cloneNode(true);
  const card = fragment.querySelector(".space-card");
  const name = fragment.querySelector(".space-card__name");
  const typeControls = fragment.querySelector('[data-role="type-controls"]');
  const ownerState = fragment.querySelector('[data-role="owner-state"]');
  const detailsPanel = fragment.querySelector('[data-role="details-panel"]');
  const detailsTitle = fragment.querySelector('[data-role="details-title"]');
  const detailsConfirmButton = fragment.querySelector('[data-role="details-confirm"]');
  const checklistItems = fragment.querySelector('[data-role="checklist-items"]');
  const commentInput = fragment.querySelector(".space-card__comment");
  const saveCommentButton = fragment.querySelector('[data-action="save-comment"]');
  const cancelCommentButton = fragment.querySelector('[data-action="cancel-comment"]');
  const commentList = fragment.querySelector('[data-role="comment-list"]');
  const currentCheck = getCurrentCheck(space.id, state.selectedChecklistType);
  const visibleDetailsType = getOpenDetailsType(space.id);
  const checklistType = visibleDetailsType || state.selectedChecklistType;
  const detailCheck = getCurrentCheck(space.id, checklistType);
  const comments = getCurrentComments(space.id);
  const draft = getCommentDraft(space.id);
  const ownerText = buildOwnerText(currentCheck);
  const isPanelOpen = Boolean(visibleDetailsType);

  card.dataset.spaceId = space.id;
  toggleClass(card, "is-checked", Boolean(currentCheck?.checked));

  setText(name, space.name);
  toggleClass(name, "has-note", comments.length > 0);
  setText(ownerState, ownerText);
  toggleClass(ownerState, "is-hidden", !ownerText);

  setHtml(
    typeControls,
    CHECKLIST_TYPES.map((type) => {
      const typeCheck = getCurrentCheck(space.id, type.id);
      const isActive = visibleDetailsType === type.id;

      return `
        <div class="space-card__type-control ${isActive ? "is-active" : ""}">
          <button
            class="space-card__type-button ${isActive ? "is-active" : ""}"
            data-action="toggle-detail-type"
            data-checklist-type="${type.id}"
            type="button"
          >
            ${type.label}
          </button>
          <label class="space-card__checkbox ${typeCheck?.checked ? "is-checked" : ""}">
            <input
              class="space-card__checkbox-input"
              data-action="toggle-check"
              data-checklist-type="${type.id}"
              type="checkbox"
              ${typeCheck?.checked ? "checked" : ""}
            />
            <span class="space-card__checkbox-ui" aria-hidden="true"></span>
          </label>
        </div>
      `;
    }).join(""),
  );

  toggleClass(detailsPanel, "is-hidden", !isPanelOpen);

  if (isPanelOpen) {
    setText(detailsTitle, `${getChecklistLabel(checklistType)} 세부내용`);
    setHtml(checklistItems, renderChecklistItemsMarkup(space, checklistType));
    setHtml(commentList, renderCurrentCommentsMarkup(comments));
    commentInput.value = draft.text ?? "";
    commentInput.placeholder = "공간 메모를 입력해 주세요.";
    setText(saveCommentButton, draft.editingCommentId ? "수정 저장" : "메모 저장");
    toggleClass(cancelCommentButton, "is-hidden", !draft.editingCommentId);
    setText(detailsConfirmButton, detailCheck?.checked ? "확인 해제" : "확인");
    toggleClass(detailsConfirmButton, "is-complete", Boolean(detailCheck?.checked));
  } else {
    setText(detailsTitle, "");
    setHtml(checklistItems, "");
    setHtml(commentList, "");
    commentInput.value = "";
    toggleClass(cancelCommentButton, "is-hidden", true);
    setText(detailsConfirmButton, "확인");
    toggleClass(detailsConfirmButton, "is-complete", false);
  }

  async function toggleChecklistState(checklistTypeToUpdate) {
    const alreadyChecked = Boolean(getCurrentCheck(space.id, checklistTypeToUpdate)?.checked);

    if (!alreadyChecked && !getSelectedEmployee()) {
      window.alert("담당 직원을 먼저 선택해 주세요.");
      renderSpaces();
      return;
    }

    const confirmed = window.confirm(buildChecklistPrompt(space, checklistTypeToUpdate, alreadyChecked));
    if (!confirmed) {
      renderSpaces();
      return;
    }

    if (alreadyChecked) {
      await state.repository.saveCurrentCheck({
        checklist_type: checklistTypeToUpdate,
        space_id: space.id,
        space_name: space.name,
        checked: false,
        employee_id: null,
        employee_name: "",
      });
      await refresh();
      return;
    }

    const employee = getSelectedEmployee();
    await state.repository.saveCurrentCheck({
      checklist_type: checklistTypeToUpdate,
      space_id: space.id,
      space_name: space.name,
      checked: true,
      employee_id: employee.id,
      employee_name: employee.name,
    });
    await refresh();
  }

  commentInput.addEventListener("input", (event) => {
    setCommentDraft(space.id, { text: event.target.value });
  });

  Array.from(typeControls.querySelectorAll('[data-action="toggle-detail-type"]')).forEach((button) => {
    button.addEventListener("click", () => {
      const nextType = button.dataset.checklistType ?? "open";
      setOpenDetailsType(space.id, visibleDetailsType === nextType ? "" : nextType);
      renderSpaces();
    });
  });

  Array.from(typeControls.querySelectorAll('[data-action="toggle-check"]')).forEach((input) => {
    input.addEventListener("click", (event) => {
      event.stopPropagation();
    });

    input.addEventListener("change", async () => {
      const checklistTypeToUpdate = input.dataset.checklistType ?? "open";
      try {
        await toggleChecklistState(checklistTypeToUpdate);
      } catch (error) {
        if (isMissingSupabaseTable(error)) {
          showSchemaHelp(error);
          return;
        }
        window.alert(`확인 상태 저장에 실패했습니다.\n${getErrorMessage(error)}`);
        renderSpaces();
      }
    });
  });

  detailsConfirmButton?.addEventListener("click", async () => {
    if (!isPanelOpen) return;

    try {
      await toggleChecklistState(checklistType);
    } catch (error) {
      if (isMissingSupabaseTable(error)) {
        showSchemaHelp(error);
        return;
      }
      window.alert(`확인 상태 저장에 실패했습니다.\n${getErrorMessage(error)}`);
      renderSpaces();
    }
  });

  saveCommentButton.addEventListener("click", async () => {
    try {
      const draftState = getCommentDraft(space.id);
      const content = draftState.text.trim();
      if (!content) {
        window.alert("메모 내용을 입력해 주세요.");
        return;
      }

      const employee = getSelectedEmployee();
      if (!employee) {
        window.alert("담당 직원을 먼저 선택해 주세요.");
        return;
      }

      saveCommentButton.disabled = true;
      if (draftState.editingCommentId) {
        await state.repository.updateCurrentComment({
          commentId: draftState.editingCommentId,
          content,
        });
      } else {
        await state.repository.addCurrentComment({
          checklist_type: "shared",
          space_id: space.id,
          space_name: space.name,
          employee_id: employee.id,
          employee_name: employee.name,
          content,
        });
      }
      clearCommentDraft(space.id);
      setOpenDetailsType(space.id, checklistType);
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

  cancelCommentButton.addEventListener("click", () => {
    clearCommentDraft(space.id);
    setOpenDetailsType(space.id, checklistType);
    renderSpaces();
  });

  Array.from(commentList.querySelectorAll('[data-action="edit-comment"]')).forEach((button) => {
    button.addEventListener("click", () => {
      const commentId = button.dataset.commentId;
      const comment = comments.find((item) => item.id === commentId);
      if (!comment || !canEditComment(comment)) return;
      setCommentDraft(space.id, {
        text: comment.content,
        editingCommentId: comment.id,
      });
      setOpenDetailsType(space.id, checklistType);
      renderSpaces();
    });
  });

  Array.from(commentList.querySelectorAll('[data-action="delete-comment"]')).forEach((button) => {
    button.addEventListener("click", async () => {
      const commentId = button.dataset.commentId;
      const comment = comments.find((item) => item.id === commentId);
      if (!comment || !canEditComment(comment)) return;

      const confirmed = window.confirm("이 메모를 삭제할까요?");
      if (!confirmed) return;

      try {
        await state.repository.deleteCurrentComment({ commentId });
        if (getCommentDraft(space.id).editingCommentId === commentId) {
          clearCommentDraft(space.id);
        }
        setOpenDetailsType(space.id, checklistType);
        await refresh();
      } catch (error) {
        if (isMissingSupabaseTable(error)) {
          showSchemaHelp(error);
          return;
        }
        window.alert(`메모 삭제에 실패했습니다.\n${getErrorMessage(error)}`);
      }
    });
  });

  return card;
}

function renderSpaceGroup(title, spaces, emptyMessage) {
  const section = document.createElement("section");
  section.className = "space-group";

  const header = document.createElement("div");
  header.className = "space-group__header";
  header.innerHTML = `
    <h3>${escapeHtml(title)}</h3>
    <span class="space-group__count">${spaces.length}</span>
  `;
  section.append(header);

  const body = document.createElement("div");
  body.className = "stack";
  if (!spaces.length) {
    body.innerHTML = `<div class="empty-state">${escapeHtml(emptyMessage)}</div>`;
  } else {
    spaces.forEach((space) => body.append(buildSpaceCard(space)));
  }
  section.append(body);
  return section;
}

function renderSpaces() {
  const spaces = sortChecklistSpaces(state.bootstrap?.spaces ?? []);
  if (elements.spacesList) elements.spacesList.innerHTML = "";

  if (!spaces.length) {
    setHtml(elements.spacesList, '<div class="empty-state">공간을 추가하면 이곳에 점검 카드가 표시됩니다.</div>');
    return;
  }

  const pending = spaces.filter((space) => !getCurrentCheck(space.id, state.selectedChecklistType)?.checked);
  const completed = spaces.filter((space) => getCurrentCheck(space.id, state.selectedChecklistType)?.checked);

  elements.spacesList?.append(
    renderSpaceGroup("체크가 필요한 곳", pending, "아직 확인이 필요한 공간이 없습니다."),
  );
  elements.spacesList?.append(
    renderSpaceGroup("체크를 완료한 곳", completed, "아직 완료된 공간이 없습니다."),
  );
}

function renderEmployeeManager() {
  const employees = state.bootstrap?.employees ?? [];
  if (!employees.length) {
    setHtml(elements.employeeList, '<div class="empty-state">아직 등록된 직원이 없습니다.</div>');
    return;
  }

  setHtml(
    elements.employeeList,
    employees
      .map(
        (employee) => `
          <article class="manage-item" data-employee-id="${escapeHtml(employee.id)}" draggable="true">
            <div class="manage-item__label">
              <span class="manage-item__handle">&#8942;&#8942;</span>
              <strong>${escapeHtml(employee.name)}</strong>
            </div>
            <button class="tiny-button is-danger" data-delete-employee="${escapeHtml(employee.id)}" type="button">삭제</button>
          </article>
        `,
      )
      .join(""),
  );

  Array.from(elements.employeeList?.querySelectorAll("[data-delete-employee]") ?? []).forEach((button) => {
    button.addEventListener("click", async () => {
      const employeeId = button.dataset.deleteEmployee;
      const employee = employees.find((item) => item.id === employeeId);
      const confirmed = window.confirm(`${employee?.name ?? "이 직원"}을(를) 삭제하시겠습니까?`);
      if (!confirmed) return;
      try {
        await state.repository.deleteEmployee(employeeId);
        if (state.selectedEmployeeId === employeeId) state.selectedEmployeeId = "";
        await refresh();
      } catch (error) {
        window.alert(`직원 삭제에 실패했습니다.\n${getErrorMessage(error)}`);
      }
    });
  });

  Array.from(elements.employeeList?.querySelectorAll("[data-employee-id]") ?? []).forEach((item) => {
    item.addEventListener("dragstart", () => {
      state.draggedEmployeeId = item.dataset.employeeId ?? null;
      item.classList.add("is-dragging");
    });

    item.addEventListener("dragend", () => {
      state.draggedEmployeeId = null;
      item.classList.remove("is-dragging");
    });

    item.addEventListener("dragover", (event) => {
      event.preventDefault();
    });

    item.addEventListener("drop", async (event) => {
      event.preventDefault();
      const targetId = item.dataset.employeeId ?? "";
      if (!state.draggedEmployeeId || state.draggedEmployeeId === targetId) return;

      const currentIds = employees.map((employee) => employee.id);
      const fromIndex = currentIds.indexOf(state.draggedEmployeeId);
      const toIndex = currentIds.indexOf(targetId);
      if (fromIndex < 0 || toIndex < 0) return;

      const nextIds = [...currentIds];
      const [moved] = nextIds.splice(fromIndex, 1);
      nextIds.splice(toIndex, 0, moved);

      try {
        await animateListReorder(
          elements.employeeList,
          "[data-employee-id]",
          "employeeId",
          async () => {
            await state.repository.saveEmployeeOrder(nextIds);
            await refresh();
          },
        );
      } catch (error) {
        window.alert(`직원 순서 변경에 실패했습니다.\n${getErrorMessage(error)}`);
      }
    });
  });
}

function renderManageSpaces() {
  const spaces = state.bootstrap?.spaces ?? [];
  if (elements.manageSpacesList) elements.manageSpacesList.innerHTML = "";

  if (!spaces.length) {
    setHtml(elements.manageSpacesList, '<div class="empty-state">공간을 추가하면 이곳에서 관리할 수 있습니다.</div>');
    setText(elements.manageSpaceSelection, "순서를 바꿀 공간을 먼저 선택해 주세요.");
    if (elements.spaceMoveUp) elements.spaceMoveUp.disabled = true;
    if (elements.spaceMoveDown) elements.spaceMoveDown.disabled = true;
    return;
  }

  const selectedIndex = spaces.findIndex((space) => space.id === state.selectedManageSpaceId);
  const selectedSpace = spaces[selectedIndex] ?? null;
  setText(
    elements.manageSpaceSelection,
    selectedSpace
      ? `${selectedSpace.name} 공간이 선택되었습니다. 위아래 화살표로 순서를 바꿀 수 있습니다.`
      : "순서를 바꿀 공간을 먼저 선택해 주세요.",
  );
  if (elements.spaceMoveUp) elements.spaceMoveUp.disabled = selectedIndex <= 0;
  if (elements.spaceMoveDown) elements.spaceMoveDown.disabled = selectedIndex < 0 || selectedIndex >= spaces.length - 1;

  spaces.forEach((space) => {
    const wrapper = document.createElement("article");
    wrapper.className = "manage-space-card";
    wrapper.dataset.spaceId = space.id;
    toggleClass(wrapper, "is-selected", space.id === state.selectedManageSpaceId);

    wrapper.innerHTML = `
      <div class="manage-space-card__summary-row">
        <h4>${escapeHtml(space.name)}</h4>
        <button class="tiny-button is-danger" data-role="delete-space" type="button">삭제</button>
      </div>
      <details>
        <summary>
          체크 항목 편집
          <span class="summary-badge">${getChecklistItems(space, "open").length || getChecklistItems(space, "always").length || getChecklistItems(space, "close").length ? "입력됨" : "비어 있음"}</span>
        </summary>
        <div class="manage-space-card__details-body">
          <label class="field">
            <span class="field__label">오픈 체크 항목</span>
            <textarea rows="4" data-role="open-template">${escapeHtml(space.open_checklist_template ?? "")}</textarea>
          </label>
          <label class="field">
            <span class="field__label">상시 체크 항목</span>
            <textarea rows="4" data-role="always-template">${escapeHtml(space.always_checklist_template ?? "")}</textarea>
          </label>
          <label class="field">
            <span class="field__label">마감 체크 항목</span>
            <textarea rows="4" data-role="close-template">${escapeHtml(space.close_checklist_template ?? "")}</textarea>
          </label>
          <div class="space-card__actions">
            <button class="secondary-button" data-role="save-space" type="button">공간 설정 저장</button>
          </div>
        </div>
      </details>
    `;

    const openInput = wrapper.querySelector('[data-role="open-template"]');
    const alwaysInput = wrapper.querySelector('[data-role="always-template"]');
    const closeInput = wrapper.querySelector('[data-role="close-template"]');
    const saveButton = wrapper.querySelector('[data-role="save-space"]');
    const deleteButton = wrapper.querySelector('[data-role="delete-space"]');
    const details = wrapper.querySelector("details");

    details.open = isManageDetailsOpen(space.id);
    details.addEventListener("toggle", () => {
      setManageDetailsOpen(space.id, details.open);
    });

    wrapper.addEventListener("click", (event) => {
      if (event.target.closest("textarea")) return;
      state.selectedManageSpaceId = space.id;
      renderManageSpaces();
    });

    saveButton.addEventListener("click", async () => {
      try {
        saveButton.disabled = true;
        await state.repository.updateSpace(space.id, {
          open_checklist_template: openInput.value.trim(),
          always_checklist_template: alwaysInput.value.trim(),
          close_checklist_template: closeInput.value.trim(),
        });
        setManageDetailsOpen(space.id, true);
        await refresh();
      } catch (error) {
        window.alert(`공간 설정 저장에 실패했습니다.\n${getErrorMessage(error)}`);
      } finally {
        saveButton.disabled = false;
      }
    });

    deleteButton.addEventListener("click", async (event) => {
      event.stopPropagation();
      const confirmed = window.confirm(`${space.name} 공간을 삭제하시겠습니까?`);
      if (!confirmed) return;
      try {
        await state.repository.deleteSpace(space.id);
        if (state.selectedManageSpaceId === space.id) state.selectedManageSpaceId = "";
        await refresh();
      } catch (error) {
        window.alert(`공간 삭제에 실패했습니다.\n${getErrorMessage(error)}`);
      }
    });

    elements.manageSpacesList?.append(wrapper);
  });
}

function buildHistoryItemMarkup(entry, comments) {
  const ownerText =
    getSettings().show_employee_name && entry.employee_name
      ? ` · 확인 ${escapeHtml(entry.employee_name)}`
      : "";

  return `
    <article class="history-item">
      <div class="history-item__top">
        <h4>${escapeHtml(entry.space_name)}</h4>
        <span class="history-badge" data-kind="${entry.checked ? "checked" : "unchecked"}">
          ${entry.checked ? "확인 완료" : "미확인"}
        </span>
      </div>
      <p class="history-item__meta">
        ${entry.checked ? "확인 완료" : "미확인"}${ownerText} · ${escapeHtml(formatKoreanDateTime(entry.archived_at, APP_TIMEZONE))}
      </p>
      <div class="history-comments">
        <strong class="history-comments__title">메모</strong>
        ${renderHistoryCommentsMarkup(comments)}
      </div>
    </article>
  `;
}

function buildHistoryGroupMarkup(title, entries, archiveDate, checklistType) {
  const body = entries.length
    ? entries
        .map((entry) => buildHistoryItemMarkup(entry, getArchivedComments(archiveDate, entry.space_id)))
        .join("")
    : '<div class="empty-state">기록이 없습니다.</div>';

  return `
    <section class="history-group">
      <div class="history-group__header">
        <h3>${escapeHtml(title)}</h3>
        <span class="space-group__count">${entries.length}</span>
      </div>
      <div class="stack">
        ${body}
      </div>
    </section>
  `;
}

function renderHistory() {
  const archives = state.bootstrap?.archived_checks ?? [];
  const days = buildCalendarDays(state.calendarMonth);
  const archiveMap = new Map();
  const retention = Number(getSettings().history_limit ?? 10);

  archives.forEach((item) => {
    const list = archiveMap.get(item.archive_date) ?? [];
    list.push(item);
    archiveMap.set(item.archive_date, list);
  });

  setText(elements.calendarLabel, formatYearMonth(state.calendarMonth));
  setText(
    elements.historySummary,
    `선택한 날짜: ${state.selectedDate} · 보관 중 ${[...new Set(archives.map((item) => item.archive_date))].length}일`,
  );
  setText(
    elements.historyRetentionCopy,
    `오픈, 상시, 마감 결과는 매일 자정에 자동 기록됩니다. 현재 설정은 최근 ${retention}일 보관입니다.`,
  );

  setHtml(
    elements.calendarGrid,
    days
      .map((day) => {
        const entries = archiveMap.get(day.key) ?? [];
        const openCount = entries.filter((item) => item.checklist_type === "open").length;
        const alwaysCount = entries.filter((item) => item.checklist_type === "always").length;
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
              ${alwaysCount ? `<span class="helper-text"><span class="calendar-dot is-always"></span> 상시 ${alwaysCount}</span>` : ""}
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

  const selectedEntries = (archiveMap.get(state.selectedDate) ?? []).sort(
    (a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0),
  );
  const openEntries = selectedEntries.filter((item) => item.checklist_type === "open");
  const alwaysEntries = selectedEntries.filter((item) => item.checklist_type === "always");
  const closeEntries = selectedEntries.filter((item) => item.checklist_type === "close");

  setHtml(
    elements.historyList,
    [
      buildHistoryGroupMarkup("오픈 기록", openEntries, state.selectedDate, "open"),
      buildHistoryGroupMarkup("상시 기록", alwaysEntries, state.selectedDate, "always"),
      buildHistoryGroupMarkup("마감 기록", closeEntries, state.selectedDate, "close"),
    ].join(""),
  );
}

function renderSettings() {
  const settings = getSettings();
  if (elements.historyLimit) elements.historyLimit.value = String(settings.history_limit ?? 10);
  if (elements.showEmployeeToggle) elements.showEmployeeToggle.checked = Boolean(settings.show_employee_name);
  renderEmployeeManager();
  renderManageSpaces();
}

function renderSetupAccess() {
  toggleClass(elements.setupLockCard, "is-hidden", state.setupUnlocked);
  toggleClass(elements.setupContent, "is-hidden", !state.setupUnlocked);
  setText(
    elements.setupAuthHelp,
    state.setupUnlocked ? "설정이 열려 있습니다." : "비밀번호를 입력하면 설정을 열 수 있습니다.",
  );
}

async function notifyOpenChecklistIfNeeded() {
  const today = getWorkDate(APP_TIMEZONE);
  const { hour, minute } = getTimePartsInTimeZone(APP_TIMEZONE);
  const unchecked = countChecklistStatus("open").unchecked;

  if (hour < 10 || (hour === 10 && minute < 30) || hour >= 13) return;
  if (!unchecked) return;
  if (window.localStorage.getItem(OPEN_ALERT_STORAGE_KEY) === today) return;

  const message = `오픈 체크리스트에 미확인 ${unchecked}곳이 남아 있습니다.`;
  let alerted = false;

  if ("Notification" in window) {
    if (window.Notification.permission === "granted") {
      new window.Notification("DD 체크리스트", { body: message });
      alerted = true;
    } else if (window.Notification.permission === "default") {
      const permission = await window.Notification.requestPermission();
      if (permission === "granted") {
        new window.Notification("DD 체크리스트", { body: message });
        alerted = true;
      }
    }
  }

  if (!alerted && document.visibilityState === "visible") {
    window.alert(message);
    alerted = true;
  }

  if (alerted) {
    window.localStorage.setItem(OPEN_ALERT_STORAGE_KEY, today);
  }
}

function startOpenAlertWatcher() {
  if (state.openAlertTimer) {
    window.clearInterval(state.openAlertTimer);
  }

  state.openAlertTimer = window.setInterval(() => {
    if (!state.bootstrap) return;
    notifyOpenChecklistIfNeeded().catch((error) => {
      console.warn("오픈 체크리스트 알림 처리에 실패했습니다.", error);
    });
  }, 60 * 1000);

  notifyOpenChecklistIfNeeded().catch((error) => {
    console.warn("오픈 체크리스트 알림 처리에 실패했습니다.", error);
  });
}

function activatePanel(name) {
  state.activePanel = name;
  if (name !== "setup") state.lastPrimaryPanel = name;

  elements.tabs.forEach((item) => item.classList.toggle("is-active", item.dataset.tab === name));
  elements.panels.forEach((panel) => panel.classList.toggle("is-active", panel.dataset.panel === name));
  toggleClass(elements.setupOpenButton, "is-active", name === "setup");
}

function openSetup() {
  activatePanel("setup");
}

function closeSetup() {
  activatePanel(state.lastPrimaryPanel || "checklist");
}

async function moveSelectedSpace(direction) {
  if (!state.selectedManageSpaceId) {
    window.alert("순서를 바꿀 공간을 먼저 선택해 주세요.");
    return;
  }

  try {
    await animateListReorder(
      elements.manageSpacesList,
      "[data-space-id]",
      "spaceId",
      async () => {
        await state.repository.reorderSpace(state.selectedManageSpaceId, direction);
        await refresh();
      },
    );
  } catch (error) {
    window.alert(`공간 순서 변경에 실패했습니다.\n${getErrorMessage(error)}`);
  }
}

function bindTabs() {
  elements.tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      activatePanel(tab.dataset.tab);
    });
  });

  elements.checklistTabs.forEach((button) => {
    if (!button.dataset.checklistType) return;
    button.addEventListener("click", () => {
      state.selectedChecklistType = button.dataset.checklistType;
      renderOverview();
      renderChecklistTabs();
      renderChecklistSummary();
      renderSpaces();
    });
  });

  elements.openOverview?.addEventListener("click", () => {
    state.selectedChecklistType = "open";
    activatePanel("checklist");
    renderOverview();
    renderChecklistTabs();
    renderChecklistSummary();
    renderSpaces();
  });

  elements.alwaysOverview?.addEventListener("click", () => {
    state.selectedChecklistType = "always";
    activatePanel("checklist");
    renderOverview();
    renderChecklistTabs();
    renderChecklistSummary();
    renderSpaces();
  });

  elements.closeOverview?.addEventListener("click", () => {
    state.selectedChecklistType = "close";
    activatePanel("checklist");
    renderOverview();
    renderChecklistTabs();
    renderChecklistSummary();
    renderSpaces();
  });
}

function bindForms() {
  elements.setupOpenButton?.addEventListener("click", openSetup);
  elements.setupCloseButton?.addEventListener("click", closeSetup);

  elements.setupAuthForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const password = elements.setupPassword?.value ?? "";
    try {
      const ok = await state.repository.verifyPassword(password);
      if (!ok) {
        window.alert("비밀번호가 올바르지 않습니다.");
        return;
      }
      state.setupUnlocked = true;
      if (elements.setupPassword) elements.setupPassword.value = "";
      renderSetupAccess();
    } catch (error) {
      window.alert(`설정 잠금 해제에 실패했습니다.\n${getErrorMessage(error)}`);
    }
  });

  elements.setupLockButton?.addEventListener("click", () => {
    state.setupUnlocked = false;
    renderSetupAccess();
  });

  elements.passwordForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const currentPassword = elements.currentPassword?.value?.trim() ?? "";
    const newPassword = elements.newPassword?.value?.trim() ?? "";
    if (!newPassword) {
      window.alert("새 비밀번호를 입력해 주세요.");
      return;
    }

    try {
      await state.repository.changePassword(currentPassword, newPassword);
      if (elements.currentPassword) elements.currentPassword.value = "";
      if (elements.newPassword) elements.newPassword.value = "";
      window.alert("비밀번호를 변경했습니다.");
      await refresh();
    } catch (error) {
      window.alert(`비밀번호 변경에 실패했습니다.\n${getErrorMessage(error)}`);
    }
  });

  elements.employeeForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = elements.employeeName?.value.trim();
    if (!name) return;

    try {
      await state.repository.addEmployee(name);
      if (elements.employeeName) elements.employeeName.value = "";
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
    const name = elements.spaceName?.value.trim();
    if (!name) return;

    try {
      await state.repository.addSpace(name);
      if (elements.spaceName) elements.spaceName.value = "";
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
    const historyLimit = Number(elements.historyLimit?.value);
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

  elements.calendarPrev?.addEventListener("click", () => {
    state.calendarMonth = addMonths(state.calendarMonth, -1);
    renderHistory();
  });

  elements.calendarNext?.addEventListener("click", () => {
    state.calendarMonth = addMonths(state.calendarMonth, 1);
    renderHistory();
  });

  elements.spaceMoveUp?.addEventListener("click", async () => {
    await moveSelectedSpace("up");
  });

  elements.spaceMoveDown?.addEventListener("click", async () => {
    await moveSelectedSpace("down");
  });
}

async function init() {
  try {
    initializeElements();
    setLoading(true, "데이터를 불러오는 중입니다.");
    renderHeader();
    activatePanel(state.activePanel);
    bindTabs();
    bindForms();
    state.repository = await createRepository();
    await refresh();
  } catch (error) {
    setLoading(false);
    renderHeader();
    setText(elements.setupStatus, `앱 초기화에 실패했습니다. ${getErrorMessage(error)}`);
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
