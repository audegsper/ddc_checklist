import { getDateKey, getWorkDate } from "./utils.js";

const CHECKLIST_TYPES = ["open", "always", "close"];

async function loadClient() {
  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
  return createClient;
}

function getYesterdayKey(timezone = "Asia/Seoul") {
  return getDateKey(new Date(Date.now() - 24 * 60 * 60 * 1000), timezone);
}

function normalizeBootstrap(data) {
  const settings = data.settings?.[0] ?? {
    id: "settings_default",
    history_limit: 10,
    timezone: "Asia/Seoul",
    show_employee_name: true,
    admin_password: "8883",
    last_daily_archive_date: null,
  };

  return {
    employees: data.employees ?? [],
    spaces: data.spaces ?? [],
    current_checks: data.current_checks ?? [],
    current_comments: data.current_comments ?? [],
    archived_checks: data.archived_checks ?? [],
    archived_comments: data.archived_comments ?? [],
    app_settings: settings,
  };
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function resolvePatchValue(payload, key, fallback) {
  return hasOwn(payload, key) ? payload[key] : fallback;
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
    if (!staleDates.length) return;

    const { error: deleteChecksError } = await client
      .from("archived_checks")
      .delete()
      .in("archive_date", staleDates);
    if (deleteChecksError) throw deleteChecksError;

    const { error: deleteCommentsError } = await client
      .from("archived_comments")
      .delete()
      .in("archive_date", staleDates);
    if (deleteCommentsError) throw deleteCommentsError;
  }

  async function reindexEmployees() {
    const { data: employees, error } = await client
      .from("employees")
      .select("id, sort_order, created_at")
      .eq("is_active", true)
      .order("sort_order")
      .order("created_at");
    if (error) throw error;

    for (const [index, employee] of (employees ?? []).entries()) {
      const nextOrder = index + 1;
      if (Number(employee.sort_order) !== nextOrder) {
        const { error: updateError } = await client
          .from("employees")
          .update({ sort_order: nextOrder })
          .eq("id", employee.id);
        if (updateError) throw updateError;
      }
    }
  }

  async function reindexSpaces() {
    const { data: spaces, error } = await client
      .from("spaces")
      .select("id, sort_order, created_at")
      .eq("is_active", true)
      .order("sort_order")
      .order("created_at");
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
    const [
      { data: spaces, error: spacesError },
      { data: currentChecks, error: currentError },
    ] = await Promise.all([
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
        comment: "",
        employee_id: current?.employee_id ?? null,
        employee_name: current?.employee_name ?? "",
        comment_employee_id: null,
        comment_employee_name: "",
        sort_order: space.sort_order,
      };
    });

    if (archivePayload.length) {
      const { error: insertArchiveError } = await client.from("archived_checks").insert(archivePayload);
      if (insertArchiveError) throw insertArchiveError;
    }

    const archiveCommentPayload = (currentComments ?? []).map((comment) => {
      const space = (spaces ?? []).find((item) => item.id === comment.space_id);
      return {
        archive_date: targetDate,
        checklist_type: checklistType,
        space_id: comment.space_id,
        space_name: comment.space_name,
        employee_id: comment.employee_id ?? null,
        employee_name: comment.employee_name ?? "",
        content: comment.content ?? "",
        sort_order: Number(space?.sort_order ?? 1),
        created_at: comment.created_at,
        updated_at: comment.updated_at,
      };
    });

    if (archiveCommentPayload.length) {
      const { error: insertArchiveCommentsError } = await client
        .from("archived_comments")
        .insert(archiveCommentPayload);
      if (insertArchiveCommentsError) throw insertArchiveCommentsError;
    }

    const { error: deleteCurrentChecksError } = await client
      .from("current_checks")
      .delete()
      .eq("work_date", targetDate)
      .eq("checklist_type", checklistType);
    if (deleteCurrentChecksError) throw deleteCurrentChecksError;
  }

  async function finalizeCommentsForDate(targetDate) {
    const [
      { data: spaces, error: spacesError },
      { data: currentComments, error: commentsError },
    ] = await Promise.all([
      client.from("spaces").select("id, sort_order").eq("is_active", true).order("sort_order"),
      client
        .from("current_comments")
        .select("*")
        .eq("work_date", targetDate)
        .order("created_at"),
    ]);
    if (spacesError) throw spacesError;
    if (commentsError) throw commentsError;

    const { error: deleteExistingArchiveCommentsError } = await client
      .from("archived_comments")
      .delete()
      .eq("archive_date", targetDate)
      .eq("checklist_type", "shared");
    if (deleteExistingArchiveCommentsError) throw deleteExistingArchiveCommentsError;

    const archiveCommentPayload = (currentComments ?? []).map((comment) => {
      const space = (spaces ?? []).find((item) => item.id === comment.space_id);
      return {
        archive_date: targetDate,
        checklist_type: "shared",
        space_id: comment.space_id,
        space_name: comment.space_name,
        employee_id: comment.employee_id ?? null,
        employee_name: comment.employee_name ?? "",
        content: comment.content ?? "",
        sort_order: Number(space?.sort_order ?? 1),
        created_at: comment.created_at,
        updated_at: comment.updated_at,
      };
    });

    if (archiveCommentPayload.length) {
      const { error: insertArchiveCommentsError } = await client
        .from("archived_comments")
        .insert(archiveCommentPayload);
      if (insertArchiveCommentsError) throw insertArchiveCommentsError;
    }

    const { error: deleteCurrentCommentsError } = await client
      .from("current_comments")
      .delete()
      .eq("work_date", targetDate);
    if (deleteCurrentCommentsError) throw deleteCurrentCommentsError;
  }

  async function autoArchiveIfNeeded() {
    const today = getWorkDate(timezone);
    const yesterday = getYesterdayKey(timezone);

    const { data: settings, error: settingsError } = await client
      .from("app_settings")
      .select("*")
      .limit(1)
      .maybeSingle();
    if (settingsError) throw settingsError;
    if (!settings) return;

    const [
      { data: staleCheckDates, error: staleCheckDatesError },
      { data: staleCommentDates, error: staleCommentDatesError },
    ] = await Promise.all([
      client.from("current_checks").select("work_date").lt("work_date", today),
      client.from("current_comments").select("work_date").lt("work_date", today),
    ]);
    if (staleCheckDatesError) throw staleCheckDatesError;
    if (staleCommentDatesError) throw staleCommentDatesError;

    if (!settings.last_daily_archive_date) {
      const uniqueStaleDates = [
        ...new Set([...(staleCheckDates ?? []), ...(staleCommentDates ?? [])].map((item) => item.work_date)),
      ].sort();
      for (const workDate of uniqueStaleDates) {
        for (const checklistType of CHECKLIST_TYPES) {
          await finalizeChecklistForDate(checklistType, workDate);
        }
        await finalizeCommentsForDate(workDate);
      }

      const { error } = await client
        .from("app_settings")
        .update({ last_daily_archive_date: yesterday, updated_at: new Date().toISOString() })
        .eq("id", settings.id);
      if (error) throw error;
    } else if (settings.last_daily_archive_date !== yesterday) {
      for (const checklistType of CHECKLIST_TYPES) {
        await finalizeChecklistForDate(checklistType, yesterday);
      }
      await finalizeCommentsForDate(yesterday);

      const { error } = await client
        .from("app_settings")
        .update({ last_daily_archive_date: yesterday, updated_at: new Date().toISOString() })
        .eq("id", settings.id);
      if (error) throw error;
    }

    await pruneArchivedChecks();
  }

  return {
    async getBootstrap() {
      try {
        await autoArchiveIfNeeded();
      } catch (error) {
        console.warn("자동 기록 보관 처리에 실패했습니다.", error);
      }

      const workDate = getWorkDate(timezone);
      const [
        { data: employees, error: employeeError },
        { data: spaces, error: spaceError },
        { data: currentChecks, error: currentError },
        { data: currentComments, error: currentCommentsError },
        { data: archivedChecks, error: archivedError },
        { data: archivedComments, error: archivedCommentsError },
        { data: settings, error: settingsError },
      ] = await Promise.all([
        client.from("employees").select("*").eq("is_active", true).order("sort_order").order("created_at"),
        client.from("spaces").select("*").eq("is_active", true).order("sort_order").order("created_at"),
        client
          .from("current_checks")
          .select("*")
          .eq("work_date", workDate)
          .order("updated_at", { ascending: false }),
        client
          .from("current_comments")
          .select("*")
          .eq("work_date", workDate)
          .order("created_at"),
        client
          .from("archived_checks")
          .select("*")
          .order("archive_date", { ascending: false })
          .order("sort_order"),
        client
          .from("archived_comments")
          .select("*")
          .order("archive_date", { ascending: false })
          .order("sort_order")
          .order("created_at"),
        client.from("app_settings").select("*").limit(1),
      ]);

      if (employeeError) throw employeeError;
      if (spaceError) throw spaceError;
      if (currentError) throw currentError;
      if (currentCommentsError) throw currentCommentsError;
      if (archivedError) throw archivedError;
      if (archivedCommentsError) throw archivedCommentsError;
      if (settingsError) throw settingsError;

      return normalizeBootstrap({
        employees,
        spaces,
        current_checks: currentChecks,
        current_comments: currentComments,
        archived_checks: archivedChecks,
        archived_comments: archivedComments,
        settings,
      });
    },

    async addEmployee(name) {
      const { data: lastEmployee, error: lastEmployeeError } = await client
        .from("employees")
        .select("sort_order")
        .eq("is_active", true)
        .order("sort_order", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (lastEmployeeError) throw lastEmployeeError;

      const { data, error } = await client
        .from("employees")
        .insert({
          name,
          is_active: true,
          sort_order: Number(lastEmployee?.sort_order ?? 0) + 1,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },

    async deleteEmployee(employeeId) {
      const { error } = await client.from("employees").delete().eq("id", employeeId);
      if (error) throw error;
      await reindexEmployees();
    },

    async saveEmployeeOrder(employeeIds) {
      for (const [index, employeeId] of employeeIds.entries()) {
        const { error } = await client
          .from("employees")
          .update({ sort_order: index + 1 })
          .eq("id", employeeId);
        if (error) throw error;
      }
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
          always_checklist_template: "",
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
        .order("sort_order")
        .order("created_at");
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
          last_daily_archive_date: null,
        });
        if (error) throw error;
      } else {
        const { error } = await client
          .from("app_settings")
          .update({ ...patch, updated_at: new Date().toISOString() })
          .eq("id", existing.id);
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
        checked: resolvePatchValue(payload, "checked", existing?.checked ?? false),
        comment: existing?.comment ?? "",
        employee_id: resolvePatchValue(payload, "employee_id", existing?.employee_id ?? null),
        employee_name: resolvePatchValue(payload, "employee_name", existing?.employee_name ?? ""),
        comment_employee_id: existing?.comment_employee_id ?? null,
        comment_employee_name: existing?.comment_employee_name ?? "",
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

    async addCurrentComment(payload) {
      const { error } = await client.from("current_comments").insert({
        work_date: payload.work_date ?? getWorkDate(timezone),
        checklist_type: payload.checklist_type ?? "shared",
        space_id: payload.space_id,
        space_name: payload.space_name,
        employee_id: payload.employee_id ?? null,
        employee_name: payload.employee_name ?? "",
        content: payload.content ?? "",
      });
      if (error) throw error;
    },

    async updateCurrentComment({ commentId, content }) {
      const { error } = await client
        .from("current_comments")
        .update({ content, updated_at: new Date().toISOString() })
        .eq("id", commentId);
      if (error) throw error;
    },

    async deleteCurrentComment({ commentId }) {
      const { error } = await client.from("current_comments").delete().eq("id", commentId);
      if (error) throw error;
    },
  };
}
