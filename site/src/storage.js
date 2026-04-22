import { createId, getWorkDate } from "./utils.js";

const STORAGE_KEY = "ddc-checklist-state-v1";

const demoState = {
  employees: [
    { id: "emp_demo_1", name: "김도현", is_active: true, created_at: new Date().toISOString() },
    { id: "emp_demo_2", name: "이수진", is_active: true, created_at: new Date().toISOString() },
  ],
  spaces: [
    {
      id: "space_demo_1",
      name: "대기실",
      checklist_template: "의자 정리\n바닥 오염 확인\n안내문 비치 상태 확인",
      is_active: true,
      sort_order: 1,
      created_at: new Date().toISOString(),
    },
    {
      id: "space_demo_2",
      name: "처치실",
      checklist_template: "소모품 수량 확인\n폐기물 분리 상태 확인\n장비 전원 상태 확인",
      is_active: true,
      sort_order: 2,
      created_at: new Date().toISOString(),
    },
  ],
  activity_logs: [],
  app_settings: {
    id: "settings_default",
    history_limit: 10,
    timezone: "Asia/Seoul",
    updated_at: new Date().toISOString(),
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

function pruneLogs(state) {
  const limit = Number(state.app_settings?.history_limit ?? 10);
  state.activity_logs = [...state.activity_logs]
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, limit);
}

export function createLocalRepository(timezone = "Asia/Seoul") {
  return {
    async getBootstrap() {
      const state = readState();
      pruneLogs(state);
      writeState(state);
      return structuredClone(state);
    },

    async addEmployee(name) {
      const state = readState();
      const employee = {
        id: createId("emp"),
        name,
        is_active: true,
        created_at: new Date().toISOString(),
      };
      state.employees.push(employee);
      writeState(state);
      return employee;
    },

    async addSpace(name) {
      const state = readState();
      const space = {
        id: createId("space"),
        name,
        checklist_template: "",
        is_active: true,
        sort_order: state.spaces.length + 1,
        created_at: new Date().toISOString(),
      };
      state.spaces.push(space);
      writeState(state);
      return space;
    },

    async updateSpace(spaceId, patch) {
      const state = readState();
      const nextSpaces = state.spaces.map((space) =>
        space.id === spaceId ? { ...space, ...patch } : space,
      );
      state.spaces = nextSpaces;
      writeState(state);
    },

    async updateSettings(patch) {
      const state = readState();
      state.app_settings = {
        ...state.app_settings,
        ...patch,
        updated_at: new Date().toISOString(),
      };
      pruneLogs(state);
      writeState(state);
    },

    async addCheck({ employeeId, employeeName, spaceId, spaceName }) {
      const state = readState();
      state.activity_logs.push({
        id: createId("log"),
        entry_type: "check",
        employee_id: employeeId,
        employee_name: employeeName,
        space_id: spaceId,
        space_name: spaceName,
        memo: "",
        work_date: getWorkDate(timezone),
        created_at: new Date().toISOString(),
      });
      pruneLogs(state);
      writeState(state);
    },

    async addComment({ employeeId, employeeName, spaceId, spaceName, memo }) {
      const state = readState();
      state.activity_logs.push({
        id: createId("log"),
        entry_type: "comment",
        employee_id: employeeId,
        employee_name: employeeName,
        space_id: spaceId,
        space_name: spaceName,
        memo,
        work_date: getWorkDate(timezone),
        created_at: new Date().toISOString(),
      });
      pruneLogs(state);
      writeState(state);
    },
  };
}

