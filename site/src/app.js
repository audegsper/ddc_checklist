import { createLocalRepository } from "./storage.js";
import { createSupabaseRepository } from "./supabase.js";
import {
  addMonths,
  buildCalendarDays,
  createId,
  escapeHtml,
  formatKoreanDate,
  formatKoreanDateTime,
  formatYearMonth,
  getDateKey,
  getTimePartsInTimeZone,
  getWorkDate,
} from "./utils.js";

const APP_VERSION = "버전 1.3.0";
const APP_DISPLAY_NAME = "DD 체크리스트";
const config = window.__APP_CONFIG__ ?? {};
const APP_TIMEZONE = config.timezone || "Asia/Seoul";
const OPEN_ALERT_STORAGE_KEY = "ddc-checklist-open-alert-date";
const CHECKLIST_TYPES = [
  { id: "open", label: "오픈", templateKey: "open_checklist_template" },
  { id: "close", label: "마감", templateKey: "close_checklist_template" },
];
const TEMPLATE_TYPES = [
  { id: "open", label: "오픈", templateKey: "open_checklist_template" },
  { id: "always", label: "상시", templateKey: "always_checklist_template" },
  { id: "close", label: "마감", templateKey: "close_checklist_template" },
];
const RECENT_NOTE_DAYS = 7;

function getChecklistTypeByTime(date = new Date()) {
  const { hour } = getTimePartsInTimeZone(APP_TIMEZONE, date);
  return hour < 18 ? "open" : "close";
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
  manageOpenDetails: {},
  manageTemplateDrafts: {},
  detailSheet: {
    spaceId: "",
    checklistType: "",
  },
  notesSheetOpen: false,
  toastTimer: null,
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
    notesTickerButton: document.getElementById("notes-ticker-button"),
    notesTickerTrack: document.getElementById("notes-ticker-track"),
    setupLockCard: document.getElementById("setup-lock-card"),
    setupContent: document.getElementById("setup-content"),
    setupAuthForm: document.getElementById("setup-auth-form"),
    setupPassword: document.getElementById("setup-password"),
    setupAuthHelp: document.getElementById("setup-auth-help"),
    setupLockButton: document.getElementById("setup-lock-button"),
    passwordForm: document.getElementById("password-form"),
    currentPassword: document.getElementById("current-password"),
    newPassword: document.getElementById("new-password"),
    detailSheetBackdrop: document.getElementById("detail-sheet-backdrop"),
    detailSheetClose: document.getElementById("detail-sheet-close"),
    detailSheetTitle: document.getElementById("detail-sheet-title"),
    detailSheetSubtitle: document.getElementById("detail-sheet-subtitle"),
    detailSheetBody: document.getElementById("detail-sheet-body"),
    notesSheetBackdrop: document.getElementById("notes-sheet-backdrop"),
    notesSheetClose: document.getElementById("notes-sheet-close"),
    notesSheetBody: document.getElementById("notes-sheet-body"),
    toast: document.getElementById("app-toast"),
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
  return TEMPLATE_TYPES.find((item) => item.id === type)?.label ?? "오픈";
}

function getChecklistConfig(type = state.selectedChecklistType) {
  return TEMPLATE_TYPES.find((item) => item.id === type) ?? TEMPLATE_TYPES[0];
}

function getChecklistTemplate(space, type = state.selectedChecklistType) {
  return space?.[getChecklistConfig(type).templateKey] ?? "";
}

function createTemplateNode(level = "major") {
  return {
    id: createId(`template_${level}`),
    title: "",
    children: [],
  };
}

function normalizeTemplateNodes(nodes, type, depth = 0, parentKey = "root") {
  if (!Array.isArray(nodes)) return [];

  return nodes
    .map((node, index) => {
      const id = String(node?.id ?? `legacy_${type}_${parentKey}_${index}`);
      const title = String(node?.title ?? node?.name ?? "").trim();
      const children =
        depth < 2 ? normalizeTemplateNodes(node?.children ?? [], type, depth + 1, id) : [];

      if (!title && !children.length) return null;
      return { id, title, children };
    })
    .filter(Boolean);
}

function parseTemplateData(rawValue, type = "open") {
  const value = String(rawValue ?? "").trim();
  if (!value) return [];

  try {
    const parsed = JSON.parse(value);
    const groups = Array.isArray(parsed) ? parsed : parsed?.groups;
    if (Array.isArray(groups)) {
      return normalizeTemplateNodes(groups, type);
    }
  } catch {
    // legacy line-based format
  }

  const lines = value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
  if (!lines.length) return [];

  return [
    {
      id: `legacy_${type}_group`,
      title: "기본 점검",
      children: lines.map((item, index) => ({
        id: `legacy_${type}_item_${index}`,
        title: item,
        children: [],
      })),
    },
  ];
}

function cleanTemplateNodes(nodes, depth = 0) {
  return (nodes ?? [])
    .map((node) => {
      const title = String(node?.title ?? "").trim();
      const children = depth < 2 ? cleanTemplateNodes(node?.children ?? [], depth + 1) : [];
      if (!title && !children.length) return null;

      return {
        id: String(node?.id ?? createId(`template_${depth}`)),
        title,
        children,
      };
    })
    .filter(Boolean);
}

function serializeTemplateData(nodes) {
  return JSON.stringify(
    {
      version: 2,
      groups: cleanTemplateNodes(nodes),
    },
    null,
    2,
  );
}

function getChecklistGroups(space, type = state.selectedChecklistType) {
  return parseTemplateData(getChecklistTemplate(space, type), type);
}

function countTemplateNodes(nodes) {
  return (nodes ?? []).reduce(
    (count, node) => count + 1 + countTemplateNodes(node.children ?? []),
    0,
  );
}

function getCurrentCategoryCheck(spaceId, checklistType, categoryKey) {
  const direct =
    state.bootstrap?.current_category_checks?.find(
      (item) =>
        item.space_id === spaceId &&
        item.checklist_type === checklistType &&
        item.category_key === categoryKey &&
        item.work_date === getWorkDate(APP_TIMEZONE),
    ) ?? null;
  if (direct) return direct;

  const legacySummary = getCurrentCheck(spaceId, checklistType);
  if (legacySummary?.checked) {
    return {
      ...legacySummary,
      category_key: categoryKey,
      category_label: "",
      is_fallback: true,
    };
  }

  return null;
}

function buildChecklistStatus(space, checklistType, overrides = new Map()) {
  const groups = getChecklistGroups(space, checklistType);
  const records = groups.map((group) => overrides.get(group.id) ?? getCurrentCategoryCheck(space.id, checklistType, group.id));
  const checkedRecords = records.filter((record) => record?.checked);
  const employeeNames = [...new Set(checkedRecords.map((record) => record.employee_name).filter(Boolean))];
  const employeeIds = [...new Set(checkedRecords.map((record) => record.employee_id).filter(Boolean))];

  return {
    groups,
    records,
    checkedRecords,
    totalCount: groups.length,
    checkedCount: checkedRecords.length,
    complete: groups.length > 0 && checkedRecords.length === groups.length,
    partial: checkedRecords.length > 0 && checkedRecords.length < groups.length,
    employeeNames,
    employeeIds,
  };
}

function buildSummaryPayload(space, checklistType, overrides = new Map()) {
  const status = buildChecklistStatus(space, checklistType, overrides);
  if (!status.complete) {
    return {
      checklist_type: checklistType,
      space_id: space.id,
      space_name: space.name,
      checked: false,
      employee_id: null,
      employee_name: "",
    };
  }

  if (status.employeeIds.length === 1) {
    return {
      checklist_type: checklistType,
      space_id: space.id,
      space_name: space.name,
      checked: true,
      employee_id: status.employeeIds[0],
      employee_name: status.employeeNames[0] ?? "",
    };
  }

  return {
    checklist_type: checklistType,
    space_id: space.id,
    space_name: space.name,
    checked: true,
    employee_id: null,
    employee_name: status.employeeNames.length ? "여러 직원" : "",
  };
}

function countChecklistStatus(type) {
  const spaces = state.bootstrap?.spaces ?? [];
  const checked = spaces.filter((space) => buildChecklistStatus(space, type).complete).length;
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

function getManageTemplateDraft(space) {
  if (!state.manageTemplateDrafts[space.id]) {
    state.manageTemplateDrafts[space.id] = {
      open: getChecklistGroups(space, "open"),
      always: getChecklistGroups(space, "always"),
      close: getChecklistGroups(space, "close"),
    };
  }
  return state.manageTemplateDrafts[space.id];
}

function clearManageTemplateDraft(spaceId) {
  delete state.manageTemplateDrafts[spaceId];
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
    return `${space.name} 공간의 ${checklistLabel} 확인 완료를 해제할까요?\n\n해제하면 해당 ${checklistLabel} 대분류 체크가 모두 해제됩니다.`;
  }

  const groups = getChecklistGroups(space, checklistType);
  const alwaysGroups = getChecklistGroups(space, "always");
  const groupLines = groups.length
    ? groups.map((group, index) => `${index + 1}. ${group.title}`).join("\n")
    : "등록된 대분류가 없습니다.";
  const alwaysLines = alwaysGroups.length
    ? ["", "상시 체크 항목", ...alwaysGroups.map((group, index) => `${index + 1}. ${group.title}`)].join("\n")
    : "";

  return [
    `${space.name} 공간의 ${checklistLabel} 대분류입니다.`,
    "",
    groupLines,
    alwaysLines,
    "",
    "모든 대분류를 확인했다면 확인을 눌러 주세요.",
  ].join("\n");
}

function buildOwnerText(space, checklistType = state.selectedChecklistType) {
  if (!getSettings().show_employee_name) return "";

  const status = buildChecklistStatus(space, checklistType);
  if (!status.checkedCount) return "";

  if (status.complete) {
    if (status.employeeNames.length === 1) {
      return `확인 직원: ${status.employeeNames[0]}`;
    }
    if (status.employeeNames.length > 1) {
      return "확인 직원: 여러 직원";
    }
  }

  if (status.partial) {
    return status.employeeNames.length <= 1
      ? `부분 확인: ${status.employeeNames[0] ?? "확인 중"}`
      : "부분 확인: 여러 직원";
  }

  return "";
}

function renderTemplateTreeMarkup(nodes, depth = 0) {
  if (!nodes.length) {
    return '<p class="helper-text">등록된 체크 항목이 없습니다.</p>';
  }

  return `
    <ul class="checklist-item-list__items ${depth ? "is-nested" : ""}">
      ${nodes
        .map(
          (node) => `
            <li>
              <span>${escapeHtml(node.title)}</span>
              ${node.children?.length ? renderTemplateTreeMarkup(node.children, depth + 1) : ""}
            </li>
          `,
        )
        .join("")}
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

function getRecentNoteEntries(days = RECENT_NOTE_DAYS) {
  const cutoff = getDateKey(new Date(Date.now() - (days - 1) * 24 * 60 * 60 * 1000), APP_TIMEZONE);
  const currentNotes = (state.bootstrap?.current_comments ?? []).map((comment) => ({
    ...comment,
    record_date: comment.work_date,
    timestamp: comment.updated_at ?? comment.created_at,
    is_archived: false,
  }));
  const archivedNotes = (state.bootstrap?.archived_comments ?? []).map((comment) => ({
    ...comment,
    record_date: comment.archive_date,
    timestamp: comment.updated_at ?? comment.archived_at ?? comment.created_at,
    is_archived: true,
  }));

  return [...currentNotes, ...archivedNotes]
    .filter((comment) => comment.record_date >= cutoff)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

function formatRecentNoteLine(comment) {
  return [
    comment.space_name,
    comment.employee_name || "이름 없음",
    comment.content,
    formatKoreanDateTime(comment.timestamp, APP_TIMEZONE),
  ].join(" · ");
}

function showToast(message) {
  if (!elements.toast) return;
  setText(elements.toast, message);
  toggleClass(elements.toast, "is-hidden", false);
  toggleClass(elements.toast, "is-visible", true);

  if (state.toastTimer) {
    window.clearTimeout(state.toastTimer);
  }

  state.toastTimer = window.setTimeout(() => {
    toggleClass(elements.toast, "is-visible", false);
    toggleClass(elements.toast, "is-hidden", true);
  }, 1800);
}

function openDetailSheet(spaceId, checklistType) {
  if (
    state.detailSheet.spaceId === spaceId &&
    state.detailSheet.checklistType === checklistType
  ) {
    closeDetailSheet();
    return;
  }
  state.detailSheet = { spaceId, checklistType };
  renderSpaces();
  renderDetailSheet();
}

function closeDetailSheet() {
  state.detailSheet = { spaceId: "", checklistType: "" };
  toggleClass(elements.detailSheetBackdrop, "is-hidden", true);
  if (elements.detailSheetBody) elements.detailSheetBody.innerHTML = "";
  if (state.bootstrap) renderSpaces();
}

function openNotesSheet() {
  state.notesSheetOpen = true;
  renderNotesSheet();
}

function closeNotesSheet() {
  state.notesSheetOpen = false;
  toggleClass(elements.notesSheetBackdrop, "is-hidden", true);
  if (elements.notesSheetBody) elements.notesSheetBody.innerHTML = "";
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
  Object.keys(state.manageTemplateDrafts).forEach((spaceId) => {
    if (!activeSpaces.some((item) => item.id === spaceId)) {
      clearManageTemplateDraft(spaceId);
    }
  });
  if (state.detailSheet.spaceId && !activeSpaces.some((item) => item.id === state.detailSheet.spaceId)) {
    closeDetailSheet();
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
  renderDetailSheet();
  renderNotesSheet();
  activatePanel(state.activePanel);
  setLoading(false);
  state.hasBootstrapped = true;
  startOpenAlertWatcher();
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
  const notes = getRecentNoteEntries();
  const tickerMarkup = notes.length
    ? [...notes.slice(0, 10), ...notes.slice(0, 10)]
        .map(
          (comment) => `
            <span class="ticker-card__item">${escapeHtml(formatRecentNoteLine(comment))}</span>
          `,
        )
        .join("")
    : '<span class="ticker-card__empty">등록된 메모가 없습니다.</span>';

  setHtml(elements.notesTickerTrack, tickerMarkup);
  toggleClass(elements.notesTickerTrack, "is-animated", notes.length > 1);
  if (elements.notesTickerButton) elements.notesTickerButton.disabled = !notes.length;
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
  const checkedCount = spaces.filter((space) => buildChecklistStatus(space, state.selectedChecklistType).complete).length;
  const uncheckedCount = Math.max(spaces.length - checkedCount, 0);

  setText(elements.summaryCount, `체크가 필요한 곳 ${uncheckedCount} · 체크를 완료한 곳 ${checkedCount}`);
  setText(elements.summaryCaption, "");
}

async function saveChecklistCategoryChanges(space, checklistType, categoryPayloads) {
  for (const payload of categoryPayloads) {
    await state.repository.saveCurrentCategoryCheck(payload);
  }

  const overrides = new Map(
    categoryPayloads.map((payload) => [
      payload.category_key,
      {
        checked: payload.checked,
        employee_id: payload.employee_id ?? null,
        employee_name: payload.employee_name ?? "",
      },
    ]),
  );
  await state.repository.saveCurrentCheck(buildSummaryPayload(space, checklistType, overrides));
}

async function toggleChecklistSummary(space, checklistType) {
  const status = buildChecklistStatus(space, checklistType);
  if (!status.groups.length) {
    window.alert(`설정에서 ${getChecklistLabel(checklistType)} 대분류를 먼저 추가해 주세요.`);
    renderSpaces();
    return;
  }

  const willCheck = !status.complete;
  if (willCheck && !getSelectedEmployee()) {
    window.alert("담당 직원을 먼저 선택해 주세요.");
    renderSpaces();
    return;
  }

  const confirmed = window.confirm(buildChecklistPrompt(space, checklistType, status.complete));
  if (!confirmed) {
    renderSpaces();
    return;
  }

  const employee = getSelectedEmployee();
  const payloads = status.groups.map((group) => ({
    checklist_type: checklistType,
    space_id: space.id,
    space_name: space.name,
    category_key: group.id,
    category_label: group.title,
    checked: willCheck,
    employee_id: willCheck ? employee?.id ?? null : null,
    employee_name: willCheck ? employee?.name ?? "" : "",
  }));

  await saveChecklistCategoryChanges(space, checklistType, payloads);
}

async function toggleChecklistCategory(space, checklistType, group) {
  const current = getCurrentCategoryCheck(space.id, checklistType, group.id);
  const willCheck = !current?.checked;

  if (willCheck && !getSelectedEmployee()) {
    window.alert("담당 직원을 먼저 선택해 주세요.");
    return;
  }

  const employee = getSelectedEmployee();
  await saveChecklistCategoryChanges(space, checklistType, [
    {
      checklist_type: checklistType,
      space_id: space.id,
      space_name: space.name,
      category_key: group.id,
      category_label: group.title,
      checked: willCheck,
      employee_id: willCheck ? employee?.id ?? null : null,
      employee_name: willCheck ? employee?.name ?? "" : "",
    },
  ]);

  showToast(`${group.title} ${willCheck ? "체크됨" : "해제됨"}`);
}

async function saveSpaceComment(spaceId) {
  const space = state.bootstrap?.spaces.find((item) => item.id === spaceId);
  if (!space) return;

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
}

function buildSpaceCard(space) {
  const fragment = elements.template.content.cloneNode(true);
  const card = fragment.querySelector(".space-card");
  const name = fragment.querySelector(".space-card__name");
  const typeControls = fragment.querySelector('[data-role="type-controls"]');
  const ownerState = fragment.querySelector('[data-role="owner-state"]');
  const selectedStatus = buildChecklistStatus(space, state.selectedChecklistType);
  const comments = getCurrentComments(space.id);

  card.dataset.spaceId = space.id;
  toggleClass(card, "is-checked", selectedStatus.complete);
  toggleClass(card, "is-partial", selectedStatus.partial);

  setHtml(
    name,
    `<span class="space-card__name-text ${comments.length ? "has-note" : ""}">${escapeHtml(space.name)}</span>`,
  );

  const ownerText = buildOwnerText(space, state.selectedChecklistType);
  setText(ownerState, ownerText);
  toggleClass(ownerState, "is-hidden", !ownerText);

  setHtml(
    typeControls,
    CHECKLIST_TYPES.map((type) => {
      const status = buildChecklistStatus(space, type.id);
      const disabled = !status.groups.length;
      const isSheetOpen =
        state.detailSheet.spaceId === space.id && state.detailSheet.checklistType === type.id;

      return `
        <div class="space-card__type-control ${status.complete ? "is-complete" : ""} ${status.partial ? "is-partial" : ""} ${isSheetOpen ? "is-active" : ""}">
          <button
            class="space-card__type-button ${isSheetOpen ? "is-active" : ""}"
            data-action="open-detail-sheet"
            data-checklist-type="${type.id}"
            type="button"
          >
            ${type.label}
          </button>
          <label class="space-card__checkbox ${status.complete ? "is-checked" : ""} ${disabled ? "is-disabled" : ""}">
            <input
              class="space-card__checkbox-input"
              data-action="toggle-summary-check"
              data-checklist-type="${type.id}"
              type="checkbox"
              ${status.complete ? "checked" : ""}
              ${disabled ? "disabled" : ""}
            />
            <span class="space-card__checkbox-ui" aria-hidden="true"></span>
          </label>
        </div>
      `;
    }).join(""),
  );

  Array.from(typeControls.querySelectorAll('[data-action="open-detail-sheet"]')).forEach((button) => {
    button.addEventListener("click", () => {
      openDetailSheet(space.id, button.dataset.checklistType ?? "open");
    });
  });

  Array.from(typeControls.querySelectorAll('[data-action="toggle-summary-check"]')).forEach((input) => {
    input.addEventListener("click", (event) => {
      event.stopPropagation();
    });

    input.addEventListener("change", async () => {
      const checklistType = input.dataset.checklistType ?? "open";
      try {
        await toggleChecklistSummary(space, checklistType);
        await refresh();
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

  return card;
}

function renderDetailSheet() {
  const { spaceId, checklistType } = state.detailSheet;
  if (!spaceId || !checklistType) {
    closeDetailSheet();
    return;
  }

  const space = state.bootstrap?.spaces.find((item) => item.id === spaceId);
  if (!space) {
    closeDetailSheet();
    return;
  }

  const checklistGroups = getChecklistGroups(space, checklistType);
  const alwaysGroups = getChecklistGroups(space, "always");
  const comments = getCurrentComments(space.id);
  const draft = getCommentDraft(space.id);

  setText(elements.detailSheetTitle, `${space.name} · ${getChecklistLabel(checklistType)}`);
  setText(elements.detailSheetSubtitle, `${getChecklistLabel(checklistType)} 체크 항목과 상시 체크 항목을 함께 확인합니다.`);
  toggleClass(elements.detailSheetBackdrop, "is-hidden", false);

  const checkableMarkup = checklistGroups.length
    ? checklistGroups
        .map((group) => {
          const record = getCurrentCategoryCheck(space.id, checklistType, group.id);
          const ownerText =
            getSettings().show_employee_name && record?.checked && record.employee_name
              ? record.employee_name
              : "";

          return `
            <article class="detail-group">
              <div class="detail-group__row">
                <label class="detail-group__check">
                  <input
                    data-action="toggle-category-check"
                    data-category-key="${escapeHtml(group.id)}"
                    type="checkbox"
                    ${record?.checked ? "checked" : ""}
                  />
                  <span class="space-card__checkbox-ui detail-group__checkbox-ui" aria-hidden="true"></span>
                  <span class="detail-group__title">${escapeHtml(group.title)}</span>
                </label>
                ${ownerText ? `<span class="helper-text">${escapeHtml(ownerText)}</span>` : ""}
              </div>
              <div class="detail-group__body">
                ${group.children?.length ? renderTemplateTreeMarkup(group.children) : '<p class="helper-text">세부 항목이 없습니다.</p>'}
              </div>
            </article>
          `;
        })
        .join("")
    : '<div class="empty-inline">등록된 대분류가 없습니다.</div>';

  const alwaysMarkup = alwaysGroups.length
    ? alwaysGroups
        .map(
          (group) => `
            <article class="detail-group is-readonly">
              <div class="detail-group__row">
                <strong class="detail-group__title">${escapeHtml(group.title)}</strong>
              </div>
              <div class="detail-group__body">
                ${group.children?.length ? renderTemplateTreeMarkup(group.children) : '<p class="helper-text">세부 항목이 없습니다.</p>'}
              </div>
            </article>
          `,
        )
        .join("")
    : '<div class="empty-inline">등록된 상시 체크 항목이 없습니다.</div>';

  setHtml(
    elements.detailSheetBody,
    `
      <div class="sheet-stack">
        <section class="surface">
          <p class="surface__label">${escapeHtml(getChecklistLabel(checklistType))} 체크 항목</p>
          <div class="stack">
            ${checkableMarkup}
          </div>
        </section>
        <section class="surface">
          <p class="surface__label">상시 체크 항목</p>
          <div class="stack">
            ${alwaysMarkup}
          </div>
        </section>
        <section class="surface">
          <p class="surface__label">특이사항 / 공유메모</p>
          <label class="field">
            <textarea
              id="detail-sheet-comment"
              rows="3"
              placeholder="공간 메모를 입력해 주세요."
            >${escapeHtml(draft.text ?? "")}</textarea>
          </label>
          <div class="space-card__actions">
            <button class="secondary-button" data-action="save-sheet-comment" type="button">${draft.editingCommentId ? "수정 저장" : "메모 저장"}</button>
            <button class="secondary-button is-subtle ${draft.editingCommentId ? "" : "is-hidden"}" data-action="cancel-sheet-comment" type="button">수정 취소</button>
          </div>
          <div class="comment-list" data-role="sheet-comment-list">
            ${renderCurrentCommentsMarkup(comments)}
          </div>
        </section>
      </div>
    `,
  );

  const commentInput = elements.detailSheetBody?.querySelector("#detail-sheet-comment");
  commentInput?.addEventListener("input", (event) => {
    setCommentDraft(space.id, { text: event.target.value });
  });

  Array.from(elements.detailSheetBody?.querySelectorAll('[data-action="toggle-category-check"]') ?? []).forEach((input) => {
    input.addEventListener("change", async () => {
      const categoryKey = input.dataset.categoryKey ?? "";
      const group = checklistGroups.find((item) => item.id === categoryKey);
      if (!group) return;

      try {
        await toggleChecklistCategory(space, checklistType, group);
        await refresh();
      } catch (error) {
        if (isMissingSupabaseTable(error)) {
          showSchemaHelp(error);
          return;
        }
        window.alert(`대분류 체크 저장에 실패했습니다.\n${getErrorMessage(error)}`);
      }
    });
  });

  elements.detailSheetBody?.querySelector('[data-action="save-sheet-comment"]')?.addEventListener("click", async () => {
    try {
      await saveSpaceComment(space.id);
      await refresh();
    } catch (error) {
      if (isMissingSupabaseTable(error)) {
        showSchemaHelp(error);
        return;
      }
      window.alert(`메모 저장에 실패했습니다.\n${getErrorMessage(error)}`);
    }
  });

  elements.detailSheetBody?.querySelector('[data-action="cancel-sheet-comment"]')?.addEventListener("click", () => {
    clearCommentDraft(space.id);
    renderDetailSheet();
  });

  Array.from(elements.detailSheetBody?.querySelectorAll('[data-action="edit-comment"]') ?? []).forEach((button) => {
    button.addEventListener("click", () => {
      const commentId = button.dataset.commentId;
      const comment = comments.find((item) => item.id === commentId);
      if (!comment || !canEditComment(comment)) return;
      setCommentDraft(space.id, {
        text: comment.content,
        editingCommentId: comment.id,
      });
      renderDetailSheet();
    });
  });

  Array.from(elements.detailSheetBody?.querySelectorAll('[data-action="delete-comment"]') ?? []).forEach((button) => {
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
}

function renderNotesSheet() {
  if (!state.notesSheetOpen) {
    closeNotesSheet();
    return;
  }

  const notes = getRecentNoteEntries();
  toggleClass(elements.notesSheetBackdrop, "is-hidden", false);

  if (!notes.length) {
    setHtml(elements.notesSheetBody, '<div class="empty-state">최근 7일간 등록된 메모가 없습니다.</div>');
    return;
  }

  const groups = new Map();
  notes.forEach((comment) => {
    const list = groups.get(comment.record_date) ?? [];
    list.push(comment);
    groups.set(comment.record_date, list);
  });

  setHtml(
    elements.notesSheetBody,
    [...groups.entries()]
      .map(
        ([date, items]) => `
          <section class="history-group">
            <div class="history-group__header">
              <h3>${escapeHtml(date)}</h3>
              <span class="space-group__count">${items.length}</span>
            </div>
            <div class="stack">
              ${items
                .map(
                  (comment) => `
                    <article class="comment-item">
                      <div class="comment-item__top">
                        <strong>${escapeHtml(comment.space_name)}</strong>
                        <span class="helper-text">${escapeHtml(formatKoreanDateTime(comment.timestamp, APP_TIMEZONE))}</span>
                      </div>
                      <p class="helper-text">${escapeHtml(comment.employee_name || "이름 없음")}</p>
                      <p class="comment-item__body">${escapeHtml(comment.content)}</p>
                    </article>
                  `,
                )
                .join("")}
            </div>
          </section>
        `,
      )
      .join(""),
  );
}

function updateTemplateDraft(spaceId, checklistType, updater) {
  const space = state.bootstrap?.spaces.find((item) => item.id === spaceId);
  if (!space) return;
  const draft = getManageTemplateDraft(space);
  draft[checklistType] = updater(structuredClone(draft[checklistType]));
}

function updateTemplateNode(nodes, targetId, updater) {
  return nodes.map((node) => {
    if (node.id === targetId) {
      return updater({ ...node, children: structuredClone(node.children ?? []) });
    }
    return {
      ...node,
      children: updateTemplateNode(node.children ?? [], targetId, updater),
    };
  });
}

function removeTemplateNode(nodes, targetId) {
  return nodes
    .filter((node) => node.id !== targetId)
    .map((node) => ({
      ...node,
      children: removeTemplateNode(node.children ?? [], targetId),
    }));
}

function renderTemplateEditorNode(node, depth = 0) {
  const levelLabel = depth === 0 ? "대분류" : depth === 1 ? "중분류" : "소분류";
  const addLabel = depth === 0 ? "중분류 추가" : depth === 1 ? "소분류 추가" : "";
  const childrenMarkup = node.children?.length
    ? `
        <div class="template-editor__children">
          ${node.children.map((child) => renderTemplateEditorNode(child, depth + 1)).join("")}
        </div>
      `
    : "";

  return `
    <article class="template-editor__node" data-node-depth="${depth}">
      <div class="template-editor__node-row">
        <span class="template-editor__node-label">${levelLabel}</span>
        <input
          class="template-editor__input"
          data-action="update-template-node"
          data-node-id="${escapeHtml(node.id)}"
          data-node-depth="${depth}"
          type="text"
          value="${escapeHtml(node.title)}"
          placeholder="${levelLabel} 이름"
        />
        ${depth < 2 ? `<button class="tiny-button" data-action="add-template-child" data-node-id="${escapeHtml(node.id)}" data-node-depth="${depth}" type="button">${addLabel}</button>` : ""}
        <button class="tiny-button is-danger" data-action="delete-template-node" data-node-id="${escapeHtml(node.id)}" type="button">삭제</button>
      </div>
      ${childrenMarkup}
    </article>
  `;
}

function renderTemplateEditorMarkup(spaceId, checklistType, nodes) {
  const typeLabel = getChecklistLabel(checklistType);
  const itemCount = countTemplateNodes(nodes);

  return `
    <section class="template-editor" data-template-type="${checklistType}">
      <div class="template-editor__header">
        <strong>${typeLabel} 체크 항목</strong>
        <div class="template-editor__actions">
          <span class="summary-badge">${itemCount ? `${itemCount}개 항목` : "비어 있음"}</span>
          <button class="tiny-button" data-action="add-template-root" data-space-id="${escapeHtml(spaceId)}" data-template-type="${checklistType}" type="button">대분류 추가</button>
        </div>
      </div>
      ${nodes.length ? nodes.map((node) => renderTemplateEditorNode(node)).join("") : '<div class="empty-inline">대분류를 추가해 주세요.</div>'}
    </section>
  `;
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

  const pending = spaces.filter((space) => !buildChecklistStatus(space, state.selectedChecklistType).complete);
  const completed = spaces.filter((space) => buildChecklistStatus(space, state.selectedChecklistType).complete);

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
    const draft = getManageTemplateDraft(space);
    const totalItemCount =
      countTemplateNodes(draft.open) +
      countTemplateNodes(draft.always) +
      countTemplateNodes(draft.close);
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
          <span class="summary-badge">${totalItemCount ? `${totalItemCount}개 항목` : "비어 있음"}</span>
        </summary>
        <div class="manage-space-card__details-body">
          ${renderTemplateEditorMarkup(space.id, "open", draft.open)}
          ${renderTemplateEditorMarkup(space.id, "always", draft.always)}
          ${renderTemplateEditorMarkup(space.id, "close", draft.close)}
          <div class="space-card__actions">
            <button class="secondary-button" data-role="save-space" type="button">공간 설정 저장</button>
          </div>
        </div>
      </details>
    `;

    const saveButton = wrapper.querySelector('[data-role="save-space"]');
    const deleteButton = wrapper.querySelector('[data-role="delete-space"]');
    const details = wrapper.querySelector("details");

    details.open = isManageDetailsOpen(space.id);
    details.addEventListener("toggle", () => {
      setManageDetailsOpen(space.id, details.open);
    });

    wrapper.addEventListener("click", (event) => {
      if (event.target.closest("input, textarea, button, summary")) return;
      state.selectedManageSpaceId = space.id;
      renderManageSpaces();
    });

    Array.from(wrapper.querySelectorAll('[data-action="update-template-node"]')).forEach((input) => {
      input.addEventListener("input", () => {
        const section = input.closest("[data-template-type]");
        const checklistType = section?.dataset.templateType;
        const nodeId = input.dataset.nodeId;
        if (!checklistType || !nodeId) return;

        updateTemplateDraft(space.id, checklistType, (nodes) =>
          updateTemplateNode(nodes, nodeId, (node) => ({
            ...node,
            title: input.value,
          })),
        );
      });
    });

    Array.from(wrapper.querySelectorAll('[data-action="add-template-root"]')).forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        const checklistType = button.dataset.templateType;
        if (!checklistType) return;

        updateTemplateDraft(space.id, checklistType, (nodes) => [...nodes, createTemplateNode("major")]);
        setManageDetailsOpen(space.id, true);
        renderManageSpaces();
      });
    });

    Array.from(wrapper.querySelectorAll('[data-action="add-template-child"]')).forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        const section = button.closest("[data-template-type]");
        const checklistType = section?.dataset.templateType;
        const nodeId = button.dataset.nodeId;
        const depth = Number(button.dataset.nodeDepth ?? 0);
        if (!checklistType || !nodeId) return;

        updateTemplateDraft(space.id, checklistType, (nodes) =>
          updateTemplateNode(nodes, nodeId, (node) => ({
            ...node,
            children: [
              ...(node.children ?? []),
              createTemplateNode(depth === 0 ? "middle" : "small"),
            ],
          })),
        );
        setManageDetailsOpen(space.id, true);
        renderManageSpaces();
      });
    });

    Array.from(wrapper.querySelectorAll('[data-action="delete-template-node"]')).forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        const section = button.closest("[data-template-type]");
        const checklistType = section?.dataset.templateType;
        const nodeId = button.dataset.nodeId;
        if (!checklistType || !nodeId) return;

        updateTemplateDraft(space.id, checklistType, (nodes) => removeTemplateNode(nodes, nodeId));
        setManageDetailsOpen(space.id, true);
        renderManageSpaces();
      });
    });

    saveButton.addEventListener("click", async () => {
      try {
        saveButton.disabled = true;
        const nextDraft = getManageTemplateDraft(space);
        await state.repository.updateSpace(space.id, {
          open_checklist_template: serializeTemplateData(nextDraft.open),
          always_checklist_template: serializeTemplateData(nextDraft.always),
          close_checklist_template: serializeTemplateData(nextDraft.close),
        });
        clearManageTemplateDraft(space.id);
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

function buildHistoryGroupMarkup(title, entries, archiveDate) {
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
  const archives = (state.bootstrap?.archived_checks ?? []).filter(
    (item) => item.checklist_type === "open" || item.checklist_type === "close",
  );
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
    `오픈과 마감 결과는 매일 자정에 자동 기록됩니다. 현재 설정은 최근 ${retention}일 보관입니다.`,
  );

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

  const selectedEntries = (archiveMap.get(state.selectedDate) ?? []).sort(
    (a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0),
  );
  const openEntries = selectedEntries.filter((item) => item.checklist_type === "open");
  const closeEntries = selectedEntries.filter((item) => item.checklist_type === "close");

  setHtml(
    elements.historyList,
    [
      buildHistoryGroupMarkup("오픈 기록", openEntries, state.selectedDate),
      buildHistoryGroupMarkup("마감 기록", closeEntries, state.selectedDate),
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
    showToast(message);
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
  elements.notesTickerButton?.addEventListener("click", () => {
    if (elements.notesTickerButton?.disabled) return;
    openNotesSheet();
  });
}

function bindForms() {
  elements.setupOpenButton?.addEventListener("click", openSetup);
  elements.setupCloseButton?.addEventListener("click", closeSetup);
  elements.detailSheetClose?.addEventListener("click", closeDetailSheet);
  elements.notesSheetClose?.addEventListener("click", closeNotesSheet);
  elements.detailSheetBackdrop?.addEventListener("click", (event) => {
    if (event.target === elements.detailSheetBackdrop) closeDetailSheet();
  });
  elements.notesSheetBackdrop?.addEventListener("click", (event) => {
    if (event.target === elements.notesSheetBackdrop) closeNotesSheet();
  });

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
