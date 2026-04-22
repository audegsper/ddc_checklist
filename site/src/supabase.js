import { getWorkDate } from "./utils.js";

async function loadClient() {
  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
  return createClient;
}

function normalizeBootstrap(data) {
  const settings = data.settings?.[0] ?? {
    id: "settings_default",
    history_limit: 10,
    timezone: "Asia/Seoul",
  };

  return {
    employees: data.employees ?? [],
    spaces: data.spaces ?? [],
    activity_logs: data.logs ?? [],
    app_settings: settings,
  };
}

export async function createSupabaseRepository(config) {
  const createClient = await loadClient();
  const client = createClient(config.supabaseUrl, config.supabaseAnonKey);
  const timezone = config.timezone || "Asia/Seoul";

  async function pruneLogs() {
    const { data: settingsRows } = await client
      .from("app_settings")
      .select("history_limit")
      .limit(1);

    const historyLimit = Number(settingsRows?.[0]?.history_limit ?? 10);
    const { data: logs } = await client
      .from("activity_logs")
      .select("id")
      .order("created_at", { ascending: false });

    const stale = (logs ?? []).slice(historyLimit).map((row) => row.id);
    if (stale.length) {
      await client.from("activity_logs").delete().in("id", stale);
    }
  }

  return {
    async getBootstrap() {
      const [{ data: employees }, { data: spaces }, { data: logs }, { data: settings }] =
        await Promise.all([
          client.from("employees").select("*").eq("is_active", true).order("created_at"),
          client.from("spaces").select("*").eq("is_active", true).order("sort_order"),
          client.from("activity_logs").select("*").order("created_at", { ascending: false }),
          client.from("app_settings").select("*").limit(1),
        ]);

      return normalizeBootstrap({ employees, spaces, logs, settings });
    },

    async addEmployee(name) {
      const { data, error } = await client
        .from("employees")
        .insert({ name, is_active: true })
        .select()
        .single();
      if (error) throw error;
      return data;
    },

    async addSpace(name) {
      const { data: lastSpace } = await client
        .from("spaces")
        .select("sort_order")
        .order("sort_order", { ascending: false })
        .limit(1)
        .maybeSingle();

      const { data, error } = await client
        .from("spaces")
        .insert({
          name,
          checklist_template: "",
          is_active: true,
          sort_order: Number(lastSpace?.sort_order ?? 0) + 1,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },

    async updateSpace(spaceId, patch) {
      const { error } = await client.from("spaces").update(patch).eq("id", spaceId);
      if (error) throw error;
    },

    async updateSettings(patch) {
      const { data: existing } = await client.from("app_settings").select("id").limit(1).maybeSingle();
      if (!existing) {
        const { error } = await client.from("app_settings").insert({
          history_limit: Number(patch.history_limit ?? 10),
          timezone,
        });
        if (error) throw error;
      } else {
        const { error } = await client.from("app_settings").update(patch).eq("id", existing.id);
        if (error) throw error;
      }
      await pruneLogs();
    },

    async addCheck({ employeeId, employeeName, spaceId, spaceName }) {
      const { error } = await client.from("activity_logs").insert({
        entry_type: "check",
        employee_id: employeeId,
        employee_name: employeeName,
        space_id: spaceId,
        space_name: spaceName,
        memo: "",
        work_date: getWorkDate(timezone),
      });
      if (error) throw error;
      await pruneLogs();
    },

    async addComment({ employeeId, employeeName, spaceId, spaceName, memo }) {
      const { error } = await client.from("activity_logs").insert({
        entry_type: "comment",
        employee_id: employeeId,
        employee_name: employeeName,
        space_id: spaceId,
        space_name: spaceName,
        memo,
        work_date: getWorkDate(timezone),
      });
      if (error) throw error;
      await pruneLogs();
    },
  };
}

