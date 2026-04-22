import { createId, getDateKey, getHourInTimeZone, getWorkDate } from "./utils.js";

const STORAGE_KEY = "ddc-checklist-state-v4";

const nowIso = () => new Date().toISOString();

const demoState = {
  employees: [
    { id: "emp_demo_1", name: "김도현", is_active: true, sort_order: 1, created_at: nowIso() },
    { id: "emp_demo_2", name: "이수진", is_active: true, sort_order: 2, created_at: nowIso() },
  ],
  spaces: [
    {
      id: "space_demo_1",
      name: "대기실",
      open_checklist_template: "의자 정리\n바닥 오염 확인\n안내문 비치 상태 확인",
      close_checklist_template: "의자 원위치 확인\n쓰레기 정리\n전등 소등 상태 확인",
      is_active: true,
      sort_order: 1,
      created_at: nowIso(),
    },
    {
      id: "space_demo_2",
      name: "처치실",
      open_checklist_template: "소모품 수량 확인\n장비 전원 확인\n폐기물함 상태 확인",
      close_checklist_template: "사용 물품 정리\n장비 전원 종료 확인\n폐기물 마감 상태 확인",
      is_active: true,
      sort_order: 2,
      created_at: nowIso(),
    },
  ],
  current_checks: [],
  current_comments: [],
  archived_checks: [],
  archived_comments: [],
  app_settings: {
    id: "settings_default",
    history_limit: 10,
    timezone: "Asia/Seoul",
    show_employee_name: true,
    admin_password: "8883",
    last_open_archive_date: null,
    last_close_archive_date: null,
    updated_at: nowIso(),
  },
};

function cloneDemoState() {
  return structuredClone(demoState);
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function resolvePatchValue(payload, key, fallback) {
  return hasOwn(payload, key) ? payload[key] : fallback;
}

function sortEmployees(employees) {
  return [...employees]
    .filter((employee) => employee.is_active !== false)
    .sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0));
}

function sortSpaces(spaces) {
  return [...spaces]
    .filter((space) => space.is_active !== false)
    .sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0));
}

function reindexEmployees(state) {
  state.employees = sortEmployees(state.employees).map((employee, index) => ({
    ...employee,
    sort_order: index + 1,
  }));
}

function reindexSpaces(state) {
  state.spaces = sortSpaces(state.spaces).map((space, index) => ({
    ...space,
    sort_order: index + 1,
  }));
}

function getYesterdayKey(timezone = "Asia/Seoul") {
  return getDateKey(new Date(Date.now() - 24 * 60 * 60 * 1000), timezone);
}

function migrateLegacyComments(state) {
  if (!state.current_comments.length) {
    state.current_comments = state.current_checks
      .filter((item) => item.comment?.trim())
      .map((item) => ({
        id: createId("comment"),
        work_date: item.work_date,
        checklist_type: item.checklist_type,
        space_id: item.space_id,
        space_name: item.space_name,
        employee_id: item.comment_employee_id ?? item.employee_id ?? null,
        employee_name: item.comment_employee_name ?? item.employee_name ?? "",
        content: item.comment,
        created_at: item.updated_at ?? nowIso(),
        updated_at: item.updated_at ?? nowIso(),
      }));
  }

  if (!state.archived_comments.length) {
    state.archived_comments = state.archived_checks
      .filter((item) => item.comment?.trim())
      .map((item) => ({
        id: createId("archive_comment"),
        archive_date: item.archive_date,
        checklist_type: item.checklist_type,
        space_id: item.space_id,
        space_name: item.space_name,
        employee_id: item.comment_employee_id ?? item.employee_id ?? null,
        employee_name: item.comment_employee_name ?? item.employee_name ?? "",
        content: item.comment,
        sort_order: item.sort_order ?? 1,
        created_at: item.archived_at ?? nowIso(),
        updated_at: item.archived_at ?? nowIso(),
        archived_at: item.archived_at ?? nowIso(),
      }));
  }
}

function normalizeState(raw) {
  const state = {
    employees: Array.isArray(raw?.employees) ? raw.employees : [],
    spaces: Array.isArray(raw?.spaces) ? raw.spaces : [],
    current_checks: Array.isArray(raw?.current_checks) ? raw.current_checks : [],
    current_comments: Array.isArray(raw?.current_comments) ? raw.current_comments : [],
    archived_checks: Array.isArray(raw?.archived_checks) ? raw.archived_checks : [],
    archived_comments: Array.isArray(raw?.archived_comments) ? raw.archived_comments : [],
    app_settings: {
      ...demoState.app_settings,
      ...(raw?.app_settings ?? {}),
    },
  };

  state.employees = state.employees.map((employee, index) => ({
    ...employee,
    sort_order: Number(employee.sort_order ?? index + 1),
  }));

  state.spaces = state.spaces.map((space, index) => ({
    ...space,
    sort_order: Number(space.sort_order ?? index + 1),
    open_checklist_template: space.open_checklist_template ?? "",
    close_checklist_template: space.close_checklist_template ?? "",
  }));

  migrateLegacyComments(state);
  reindexEmployees(state);
  reindexSpaces(state);
  return state;
}

function readState() {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    const state = cloneDemoState();
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return state;
  }

  try {
    const parsed = JSON.parse(raw);
    return normalizeState(parsed);
  } catch {
    const state = cloneDemoState();
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return state;
  }
}

function writeState(state) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function pruneArchivedChecks(state) {
  const limit = Number(state.app_settings?.history_limit ?? 10);
  const sortedDates = [...new Set(state.archived_checks.map((item) => item.archive_date))].sort((a, b) =>
    a < b ? 1 : -1,
  );
  const allowedDates = new Set(sortedDates.slice(0, limit));
  state.archived_checks = state.archived_checks.filter((item) => allowedDates.has(item.archive_date));
  state.archived_comments = state.archived_comments.filter((item) =>
    allowedDates.has(item.archive_date),
  );
}

function upsertCurrentCheck(state, payload) {
  const index = state.current_checks.findIndex(
    (item) =>
      item.work_date === payload.work_date &&
      item.checklist_type === payload.checklist_type &&
      item.space_id === payload.space_id,
  );

  const current = index >= 0 ? state.current_checks[index] : null;
  const next = {
    id: current?.id ?? createId("current"),
    work_date: payload.work_date,
    checklist_type: payload.checklist_type,
    space_id: payload.space_id,
    space_name: payload.space_name,
    checked: resolvePatchValue(payload, "checked", current?.checked ?? false),
    employee_id: resolvePatchValue(payload, "employee_id", current?.employee_id ?? null),
    employee_name: resolvePatchValue(payload, "employee_name", current?.employee_name ?? ""),
    comment: current?.comment ?? "",
    comment_employee_id: current?.comment_employee_id ?? null,
    comment_employee_name: current?.comment_employee_name ?? "",
    updated_at: nowIso(),
  };

  if (index >= 0) state.current_checks[index] = next;
  else state.current_checks.push(next);
}

function finalizeChecklistForDate(state, checklistType, targetDate) {
  const currentMap = new Map(
    state.current_checks
      .filter((item) => item.work_date === targetDate && item.checklist_type === checklistType)
      .map((item) => [item.space_id, item]),
  );

  state.archived_checks = state.archived_checks.filter(
    (item) => !(item.archive_date === targetDate && item.checklist_type === checklistType),
  );
  state.archived_comments = state.archived_comments.filter(
    (item) => !(item.archive_date === targetDate && item.checklist_type === checklistType),
  );

  sortSpaces(state.spaces).forEach((space) => {
    const current = currentMap.get(space.id);
    state.archived_checks.push({
      id: createId("archive"),
      archive_date: targetDate,
      checklist_type: checklistType,
      space_id: space.id,
      space_name: space.name,
      checked: Boolean(current?.checked),
      comment: "",
      employee_id: current?.employee_id ?? null,
      employee_name: current?.employee_name ?? "",
      comment_employee_id: null,
      comment_employee_name: "",
      sort_order: space.sort_order,
      archived_at: nowIso(),
    });
  });

  state.current_comments
    .filter((item) => item.work_date === targetDate && item.checklist_type === checklistType)
    .forEach((item) => {
      const space = state.spaces.find((entry) => entry.id === item.space_id);
      state.archived_comments.push({
        id: createId("archive_comment"),
        archive_date: targetDate,
        checklist_type: checklistType,
        space_id: item.space_id,
        space_name: item.space_name,
        employee_id: item.employee_id ?? null,
        employee_name: item.employee_name ?? "",
        content: item.content ?? "",
        sort_order: Number(space?.sort_order ?? 1),
        created_at: item.created_at ?? nowIso(),
        updated_at: item.updated_at ?? nowIso(),
        archived_at: nowIso(),
      });
    });

  state.current_checks = state.current_checks.filter(
    (item) => !(item.work_date === targetDate && item.checklist_type === checklistType),
  );
  state.current_comments = state.current_comments.filter(
    (item) => !(item.work_date === targetDate && item.checklist_type === checklistType),
  );
}

function autoArchiveIfNeeded(state, timezone = "Asia/Seoul") {
  const today = getWorkDate(timezone);
  const hour = getHourInTimeZone(timezone);

  if (hour >= 15 && state.app_settings.last_open_archive_date !== today) {
    finalizeChecklistForDate(state, "open", today);
    state.app_settings.last_open_archive_date = today;
  }

  const yesterday = getYesterdayKey(timezone);
  if (state.app_settings.last_close_archive_date !== yesterday) {
    finalizeChecklistForDate(state, "close", yesterday);
    state.app_settings.last_close_archive_date = yesterday;
  }

  pruneArchivedChecks(state);
}

export function createLocalRepository(timezone = "Asia/Seoul") {
  return {
    async getBootstrap() {
      const state = readState();
      autoArchiveIfNeeded(state, timezone);
      reindexEmployees(state);
      reindexSpaces(state);
      writeState(state);
      return structuredClone(state);
    },

    async addEmployee(name) {
      const state = readState();
      state.employees.push({
        id: createId("emp"),
        name,
        is_active: true,
        sort_order: sortEmployees(state.employees).length + 1,
        created_at: nowIso(),
      });
      reindexEmployees(state);
      writeState(state);
      return state.employees[state.employees.length - 1];
    },

    async deleteEmployee(employeeId) {
      const state = readState();
      state.employees = state.employees.filter((employee) => employee.id !== employeeId);
      state.current_checks = state.current_checks.map((item) =>
        item.employee_id === employeeId ? { ...item, employee_id: null } : item,
      );
      state.archived_checks = state.archived_checks.map((item) =>
        item.employee_id === employeeId ? { ...item, employee_id: null } : item,
      );
      state.current_comments = state.current_comments.map((item) =>
        item.employee_id === employeeId ? { ...item, employee_id: null } : item,
      );
      state.archived_comments = state.archived_comments.map((item) =>
        item.employee_id === employeeId ? { ...item, employee_id: null } : item,
      );
      reindexEmployees(state);
      writeState(state);
    },

    async saveEmployeeOrder(employeeIds) {
      const state = readState();
      const map = new Map(state.employees.map((employee) => [employee.id, employee]));
      state.employees = employeeIds
        .map((id) => map.get(id))
        .filter(Boolean)
        .map((employee, index) => ({ ...employee, sort_order: index + 1 }));
      reindexEmployees(state);
      writeState(state);
    },

    async addSpace(name) {
      const state = readState();
      state.spaces.push({
        id: createId("space"),
        name,
        open_checklist_template: "",
        close_checklist_template: "",
        is_active: true,
        sort_order: sortSpaces(state.spaces).length + 1,
        created_at: nowIso(),
      });
      reindexSpaces(state);
      writeState(state);
      return state.spaces[state.spaces.length - 1];
    },

    async deleteSpace(spaceId) {
      const state = readState();
      state.spaces = state.spaces.filter((space) => space.id !== spaceId);
      state.current_checks = state.current_checks.filter((item) => item.space_id !== spaceId);
      state.archived_checks = state.archived_checks.filter((item) => item.space_id !== spaceId);
      state.current_comments = state.current_comments.filter((item) => item.space_id !== spaceId);
      state.archived_comments = state.archived_comments.filter((item) => item.space_id !== spaceId);
      reindexSpaces(state);
      writeState(state);
    },

    async updateSpace(spaceId, patch) {
      const state = readState();
      state.spaces = state.spaces.map((space) => (space.id === spaceId ? { ...space, ...patch } : space));
      reindexSpaces(state);
      writeState(state);
    },

    async reorderSpace(spaceId, direction) {
      const state = readState();
      const spaces = sortSpaces(state.spaces);
      const index = spaces.findIndex((space) => space.id === spaceId);
      const swapIndex = direction === "up" ? index - 1 : index + 1;
      if (index < 0 || swapIndex < 0 || swapIndex >= spaces.length) return;
      [spaces[index], spaces[swapIndex]] = [spaces[swapIndex], spaces[index]];
      state.spaces = spaces;
      reindexSpaces(state);
      writeState(state);
    },

    async saveSpaceOrder(spaceIds) {
      const state = readState();
      const map = new Map(state.spaces.map((space) => [space.id, space]));
      state.spaces = spaceIds
        .map((id) => map.get(id))
        .filter(Boolean)
        .map((space, index) => ({ ...space, sort_order: index + 1 }));
      reindexSpaces(state);
      writeState(state);
    },

    async updateSettings(patch) {
      const state = readState();
      state.app_settings = {
        ...state.app_settings,
        ...patch,
        updated_at: nowIso(),
      };
      pruneArchivedChecks(state);
      writeState(state);
    },

    async verifyPassword(password) {
      const state = readState();
      return state.app_settings.admin_password === password;
    },

    async changePassword(currentPassword, nextPassword) {
      const state = readState();
      if (state.app_settings.admin_password !== currentPassword) {
        throw new Error("현재 비밀번호가 일치하지 않습니다.");
      }
      state.app_settings.admin_password = nextPassword;
      state.app_settings.updated_at = nowIso();
      writeState(state);
    },

    async saveCurrentCheck(payload) {
      const state = readState();
      upsertCurrentCheck(state, {
        ...payload,
        work_date: payload.work_date ?? getWorkDate(timezone),
      });
      writeState(state);
    },

    async addCurrentComment(payload) {
      const state = readState();
      state.current_comments.push({
        id: createId("comment"),
        work_date: payload.work_date ?? getWorkDate(timezone),
        checklist_type: payload.checklist_type,
        space_id: payload.space_id,
        space_name: payload.space_name,
        employee_id: payload.employee_id ?? null,
        employee_name: payload.employee_name ?? "",
        content: payload.content ?? "",
        created_at: nowIso(),
        updated_at: nowIso(),
      });
      writeState(state);
    },

    async updateCurrentComment({ commentId, content }) {
      const state = readState();
      state.current_comments = state.current_comments.map((item) =>
        item.id === commentId ? { ...item, content, updated_at: nowIso() } : item,
      );
      writeState(state);
    },

    async deleteCurrentComment({ commentId }) {
      const state = readState();
      state.current_comments = state.current_comments.filter((item) => item.id !== commentId);
      writeState(state);
    },
  };
}
