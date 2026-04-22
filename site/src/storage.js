import { createId, getWorkDate } from "./utils.js";

const STORAGE_KEY = "ddc-checklist-state-v3";

const nowIso = () => new Date().toISOString();

const demoState = {
  employees: [
    { id: "emp_demo_1", name: "김도현", is_active: true, created_at: nowIso() },
    { id: "emp_demo_2", name: "이수진", is_active: true, created_at: nowIso() },
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
  archived_checks: [],
  app_settings: {
    id: "settings_default",
    history_limit: 10,
    timezone: "Asia/Seoul",
    show_employee_name: true,
    admin_password: "8883",
    updated_at: nowIso(),
  },
};

function readState() {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(demoState));
    return structuredClone(demoState);
  }

  try {
    return JSON.parse(raw);
  } catch {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(demoState));
    return structuredClone(demoState);
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
}

function sortSpaces(spaces) {
  return [...spaces]
    .filter((space) => space.is_active !== false)
    .sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0));
}

function reindexSpaces(state) {
  state.spaces = sortSpaces(state.spaces).map((space, index) => ({
    ...space,
    sort_order: index + 1,
  }));
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
    checked: payload.checked ?? current?.checked ?? false,
    comment: payload.comment ?? current?.comment ?? "",
    employee_id: payload.employee_id ?? current?.employee_id ?? null,
    employee_name: payload.employee_name ?? current?.employee_name ?? "",
    updated_at: nowIso(),
  };

  if (index >= 0) {
    state.current_checks[index] = next;
  } else {
    state.current_checks.push(next);
  }
}

export function createLocalRepository(timezone = "Asia/Seoul") {
  return {
    async getBootstrap() {
      const state = readState();
      pruneArchivedChecks(state);
      reindexSpaces(state);
      writeState(state);
      return structuredClone(state);
    },

    async addEmployee(name) {
      const state = readState();
      const employee = {
        id: createId("emp"),
        name,
        is_active: true,
        created_at: nowIso(),
      };
      state.employees.push(employee);
      writeState(state);
      return employee;
    },

    async deleteEmployee(employeeId) {
      const state = readState();
      state.employees = state.employees.filter((employee) => employee.id !== employeeId);
      state.current_checks = state.current_checks.map((item) =>
        item.employee_id === employeeId ? { ...item, employee_id: null, employee_name: "" } : item,
      );
      state.archived_checks = state.archived_checks.map((item) =>
        item.employee_id === employeeId ? { ...item, employee_id: null, employee_name: "" } : item,
      );
      writeState(state);
    },

    async addSpace(name) {
      const state = readState();
      const space = {
        id: createId("space"),
        name,
        open_checklist_template: "",
        close_checklist_template: "",
        is_active: true,
        sort_order: sortSpaces(state.spaces).length + 1,
        created_at: nowIso(),
      };
      state.spaces.push(space);
      reindexSpaces(state);
      writeState(state);
      return space;
    },

    async deleteSpace(spaceId) {
      const state = readState();
      state.spaces = state.spaces.filter((space) => space.id !== spaceId);
      state.current_checks = state.current_checks.filter((item) => item.space_id !== spaceId);
      state.archived_checks = state.archived_checks.filter((item) => item.space_id !== spaceId);
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

    async clearCurrentComment({ checklistType, spaceId, workDate }) {
      const state = readState();
      upsertCurrentCheck(state, {
        work_date: workDate ?? getWorkDate(timezone),
        checklist_type: checklistType,
        space_id: spaceId,
        space_name: state.spaces.find((item) => item.id === spaceId)?.name ?? "",
        comment: "",
      });
      writeState(state);
    },

    async finalizeChecklist({ checklistType, workDate }) {
      const state = readState();
      const targetDate = workDate ?? getWorkDate(timezone);
      const currentMap = new Map(
        state.current_checks
          .filter((item) => item.work_date === targetDate && item.checklist_type === checklistType)
          .map((item) => [item.space_id, item]),
      );

      state.archived_checks = state.archived_checks.filter(
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
          comment: current?.comment ?? "",
          employee_id: current?.employee_id ?? null,
          employee_name: current?.employee_name ?? "",
          sort_order: space.sort_order,
          archived_at: nowIso(),
        });
      });

      state.current_checks = state.current_checks.filter(
        (item) => !(item.work_date === targetDate && item.checklist_type === checklistType),
      );

      pruneArchivedChecks(state);
      writeState(state);
    },
  };
}
