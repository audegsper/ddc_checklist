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
    show_employee_name: true,
    admin_password: "8883",
    last_open_archive_date: null,
    last_close_archive_date: null,
  };

  return {
    employees: data.employees ?? [],
    spaces: data.spaces ?? [],
    current_checks: data.current_checks ?? [],
    archived_checks: data.archived_checks ?? [],
    app_settings: settings,
  };
}

function getYesterdayKey(now = new Date()) {
  const date = new Date(now);
  date.setDate(now.getDate() - 1);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export async function createSupabaseRepository(config) {
  const createClient = await loadClient();
  const client = createClient(config.supabaseUrl, config.supabaseAnonKey);
  const timezone = config.timezone || "Asia/Seoul";

  async function pruneArchivedChecks() {
    const { data: settingsRows, error: settingsError } = await client
      .from("app_settings")
      .select("history_limit")
      .limit(1);
    if (settingsError) throw settingsError;

    const historyLimit = Number(settingsRows?.[0]?.history_limit ?? 10);
    const { data: archives, error: archiveError } = await client
      .from("archived_checks")
      .select("archive_date")
      .order("archive_date", { ascending: false });
    if (archiveError) throw archiveError;

    const sortedDates = [...new Set((archives ?? []).map((item) => item.archive_date))];
    const staleDates = sortedDates.slice(historyLimit);
    if (staleDates.length) {
      const { error } = await client.from("archived_checks").delete().in("archive_date", staleDates);
      if (error) throw error;
    }
  }

  async function reindexSpaces() {
    const { data: spaces, error } = await client
      .from("spaces")
      .select("id, sort_order")
      .eq("is_active", true)
      .order("sort_order");
    if (error) throw error;

    for (const [index, space] of (spaces ?? []).entries()) {
      const nextOrder = index + 1;
      if (Number(space.sort_order) !== nextOrder) {
        const { error: updateError } = await client
          .from("spaces")
          .update({ sort_order: nextOrder })
          .eq("id", space.id);
        if (updateError) throw updateError;
      }
    }
  }

  async function finalizeChecklistForDate(checklistType, targetDate) {
    const [{ data: spaces, error: spacesError }, { data: currentChecks, error: currentError }] =
      await Promise.all([
        client.from("spaces").select("*").eq("is_active", true).order("sort_order"),
        client
          .from("current_checks")
          .select("*")
          .eq("work_date", targetDate)
          .eq("checklist_type", checklistType),
      ]);
    if (spacesError) throw spacesError;
    if (currentError) throw currentError;

    const { error: deleteExistingArchiveError } = await client
      .from("archived_checks")
      .delete()
      .eq("archive_date", targetDate)
      .eq("checklist_type", checklistType);
    if (deleteExistingArchiveError) throw deleteExistingArchiveError;

    const currentMap = new Map((currentChecks ?? []).map((item) => [item.space_id, item]));
    const archivePayload = (spaces ?? []).map((space) => {
      const current = currentMap.get(space.id);
      return {
        archive_date: targetDate,
        checklist_type: checklistType,
        space_id: space.id,
        space_name: space.name,
        checked: Boolean(current?.checked),
        comment: current?.comment ?? "",
        employee_id: current?.employee_id ?? null,
        employee_name: current?.employee_name ?? "",
        comment_employee_id: current?.comment_employee_id ?? null,
        comment_employee_name: current?.comment_employee_name ?? "",
        sort_order: space.sort_order,
      };
    });

    if (archivePayload.length) {
      const { error: insertArchiveError } = await client.from("archived_checks").insert(archivePayload);
      if (insertArchiveError) throw insertArchiveError;
    }

    const { error: deleteCurrentError } = await client
      .from("current_checks")
      .delete()
      .eq("work_date", targetDate)
      .eq("checklist_type", checklistType);
    if (deleteCurrentError) throw deleteCurrentError;
  }

  async function autoArchiveIfNeeded() {
    const now = new Date();
    const today = getWorkDate(timezone);
    const yesterday = getYesterdayKey(now);
    const hour = now.getHours();

    const { data: settings, error: settingsError } = await client
      .from("app_settings")
      .select("*")
      .limit(1)
      .maybeSingle();
    if (settingsError) throw settingsError;
    if (!settings) return;

    if (hour >= 15 && settings.last_open_archive_date !== today) {
      await finalizeChecklistForDate("open", today);
      const { error } = await client
        .from("app_settings")
        .update({ last_open_archive_date: today, updated_at: new Date().toISOString() })
        .eq("id", settings.id);
      if (error) throw error;
    }

    if (settings.last_close_archive_date !== yesterday) {
      await finalizeChecklistForDate("close", yesterday);
      const { error } = await client
        .from("app_settings")
        .update({ last_close_archive_date: yesterday, updated_at: new Date().toISOString() })
        .eq("id", settings.id);
      if (error) throw error;
    }

    await pruneArchivedChecks();
  }

  return {
    async getBootstrap() {
      await autoArchiveIfNeeded();
      const workDate = getWorkDate(timezone);
      const [
        { data: employees, error: employeeError },
        { data: spaces, error: spaceError },
        { data: currentChecks, error: currentError },
        { data: archivedChecks, error: archivedError },
        { data: settings, error: settingsError },
      ] = await Promise.all([
        client.from("employees").select("*").eq("is_active", true).order("created_at"),
        client.from("spaces").select("*").eq("is_active", true).order("sort_order"),
        client
          .from("current_checks")
          .select("*")
          .eq("work_date", workDate)
          .order("updated_at", { ascending: false }),
        client
          .from("archived_checks")
          .select("*")
          .order("archive_date", { ascending: false })
          .order("sort_order"),
        client.from("app_settings").select("*").limit(1),
      ]);

      if (employeeError) throw employeeError;
      if (spaceError) throw spaceError;
      if (currentError) throw currentError;
      if (archivedError) throw archivedError;
      if (settingsError) throw settingsError;

      return normalizeBootstrap({
        employees,
        spaces,
        current_checks: currentChecks,
        archived_checks: archivedChecks,
        settings,
      });
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

    async deleteEmployee(employeeId) {
      const { error } = await client.from("employees").delete().eq("id", employeeId);
      if (error) throw error;
    },

    async addSpace(name) {
      const { data: lastSpace, error: lastSpaceError } = await client
        .from("spaces")
        .select("sort_order")
        .eq("is_active", true)
        .order("sort_order", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (lastSpaceError) throw lastSpaceError;

      const { data, error } = await client
        .from("spaces")
        .insert({
          name,
          open_checklist_template: "",
          close_checklist_template: "",
          is_active: true,
          sort_order: Number(lastSpace?.sort_order ?? 0) + 1,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },

    async deleteSpace(spaceId) {
      const { error } = await client.from("spaces").delete().eq("id", spaceId);
      if (error) throw error;
      await reindexSpaces();
    },

    async updateSpace(spaceId, patch) {
      const { error } = await client.from("spaces").update(patch).eq("id", spaceId);
      if (error) throw error;
    },

    async reorderSpace(spaceId, direction) {
      const { data: spaces, error: spacesError } = await client
        .from("spaces")
        .select("id, sort_order")
        .eq("is_active", true)
        .order("sort_order");
      if (spacesError) throw spacesError;

      const list = spaces ?? [];
      const index = list.findIndex((space) => space.id === spaceId);
      const swapIndex = direction === "up" ? index - 1 : index + 1;
      if (index < 0 || swapIndex < 0 || swapIndex >= list.length) return;

      const current = list[index];
      const target = list[swapIndex];

      const { error: updateCurrentError } = await client
        .from("spaces")
        .update({ sort_order: target.sort_order })
        .eq("id", current.id);
      if (updateCurrentError) throw updateCurrentError;

      const { error: updateTargetError } = await client
        .from("spaces")
        .update({ sort_order: current.sort_order })
        .eq("id", target.id);
      if (updateTargetError) throw updateTargetError;
    },

    async saveSpaceOrder(spaceIds) {
      for (const [index, spaceId] of spaceIds.entries()) {
        const { error } = await client
          .from("spaces")
          .update({ sort_order: index + 1 })
          .eq("id", spaceId);
        if (error) throw error;
      }
    },

    async updateSettings(patch) {
      const { data: existing, error: existingError } = await client
        .from("app_settings")
        .select("id")
        .limit(1)
        .maybeSingle();
      if (existingError) throw existingError;

      if (!existing) {
        const { error } = await client.from("app_settings").insert({
          history_limit: Number(patch.history_limit ?? 10),
          timezone,
          show_employee_name: Boolean(patch.show_employee_name ?? true),
          admin_password: patch.admin_password ?? "8883",
          last_open_archive_date: null,
          last_close_archive_date: null,
        });
        if (error) throw error;
      } else {
        const { error } = await client.from("app_settings").update(patch).eq("id", existing.id);
        if (error) throw error;
      }

      await pruneArchivedChecks();
    },

    async verifyPassword(password) {
      const { data, error } = await client
        .from("app_settings")
        .select("admin_password")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data?.admin_password ?? "8883") === password;
    },

    async changePassword(currentPassword, nextPassword) {
      const { data, error } = await client
        .from("app_settings")
        .select("id, admin_password")
        .limit(1)
        .maybeSingle();
      if (error) throw error;

      if ((data?.admin_password ?? "8883") !== currentPassword) {
        throw new Error("현재 비밀번호가 일치하지 않습니다.");
      }

      const { error: updateError } = await client
        .from("app_settings")
        .update({ admin_password: nextPassword, updated_at: new Date().toISOString() })
        .eq("id", data.id);
      if (updateError) throw updateError;
    },

    async saveCurrentCheck(payload) {
      const workDate = payload.work_date ?? getWorkDate(timezone);
      const { data: existing, error: existingError } = await client
        .from("current_checks")
        .select("*")
        .eq("work_date", workDate)
        .eq("checklist_type", payload.checklist_type)
        .eq("space_id", payload.space_id)
        .limit(1)
        .maybeSingle();
      if (existingError) throw existingError;

      const nextPayload = {
        work_date: workDate,
        checklist_type: payload.checklist_type,
        space_id: payload.space_id,
        space_name: payload.space_name,
        checked: payload.checked ?? existing?.checked ?? false,
        comment: payload.comment ?? existing?.comment ?? "",
        employee_id: payload.employee_id ?? existing?.employee_id ?? null,
        employee_name: payload.employee_name ?? existing?.employee_name ?? "",
        comment_employee_id: payload.comment_employee_id ?? existing?.comment_employee_id ?? null,
        comment_employee_name:
          payload.comment_employee_name ?? existing?.comment_employee_name ?? "",
        updated_at: new Date().toISOString(),
      };

      if (existing) {
        const { error } = await client.from("current_checks").update(nextPayload).eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await client.from("current_checks").insert(nextPayload);
        if (error) throw error;
      }
    },

    async clearCurrentComment({ checklistType, spaceId, workDate }) {
      const targetDate = workDate ?? getWorkDate(timezone);
      const { data: existing, error: existingError } = await client
        .from("current_checks")
        .select("*")
        .eq("work_date", targetDate)
        .eq("checklist_type", checklistType)
        .eq("space_id", spaceId)
        .limit(1)
        .maybeSingle();
      if (existingError) throw existingError;

      if (existing) {
        const { error } = await client
          .from("current_checks")
          .update({
            comment: "",
            comment_employee_id: null,
            comment_employee_name: "",
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id);
        if (error) throw error;
      }
    },
  };
}
