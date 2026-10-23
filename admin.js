"use strict";
const $ = (id) => document.getElementById(id);
const cfg = window.TAROT_CONFIG;
const db = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
const msg = (s) => ($("notice").textContent = s);
let rewards = [],
  settings = {},
  draws = [],
  drawOffset = 0,
  loadedAll = false;
const PAGE = 100;
function el(tag, text, klass) {
  const x = document.createElement(tag);
  if (text !== undefined) x.textContent = text;
  if (klass) x.className = klass;
  return x;
}
function field(parent, labelText, value, type = "text", attrs = {}) {
  const l = el("label", labelText);
  const i = document.createElement("input");
  i.type = type;
  if (type === "checkbox") i.checked = !!value;
  else i.value = value ?? "";
  Object.assign(i, attrs);
  l.append(i);
  parent.append(l);
  return i;
}
function btn(parent, text, handler, secondary = false) {
  const b = el("button", text, secondary ? "secondary" : "");
  b.type = "button";
  b.onclick = handler;
  parent.append(b);
  return b;
}
function url(path) {
  return path
    ? db.storage.from("tarot-rewards").getPublicUrl(path).data.publicUrl
    : "";
}
function thumb(parent, path) {
  parent.replaceChildren();
  if (path) {
    const im = document.createElement("img");
    im.src = url(path);
    im.alt = "Uploaded artwork";
    parent.append(im);
  } else parent.append(el("span", "No image selected", "hint"));
}
function requireNumber(value, label, max = 100000) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > max)
    throw Error(`${label} must be a whole number from 0 to ${max}.`);
  return n;
}
async function upload(file) {
  if (!file) return null;
  if (file.type !== "image/png" || file.size > 5 * 1024 * 1024)
    throw Error("Select a PNG image under 5 MB.");
  const path = `v3/${crypto.randomUUID()}.png`;
  const { error } = await db.storage
    .from("tarot-rewards")
    .upload(path, file, { contentType: "image/png", upsert: false });
  if (error) throw error;
  return path;
}
async function check() {
  const {
    data: { user },
    error,
  } = await db.auth.getUser();
  if (error) {
    msg(error.message);
    return;
  }
  let allowed = false;
  if (user) {
    const lookup = await db
      .from("admins")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (lookup.error) {
      msg(lookup.error.message);
      return;
    }
    allowed = !!lookup.data;
  }
  $("login").classList.toggle("hidden", allowed);
  $("dashboard").classList.toggle("hidden", !allowed);
  if (allowed) await refreshAll();
  else if (user) msg("This account is not authorized as an admin.");
}
$("signin").onclick = async () => {
  const { error } = await db.auth.signInWithPassword({
    email: $("email").value,
    password: $("password").value,
  });
  if (error) msg(error.message);
  else {
    msg("Signed in.");
    await check();
  }
};
$("signout").onclick = async () => {
  await db.auth.signOut();
  $("dashboard").classList.add("hidden");
  $("login").classList.remove("hidden");
  msg("Signed out.");
};
async function refreshAll() {
  await Promise.all([loadSettings(), loadRewards(), loadHistory(true)]);
}
async function loadSettings() {
  const { data, error } = await db
    .from("tarot_settings")
    .select("*")
    .eq("id", 1)
    .single();
  if (error) {
    msg("Settings: " + error.message);
    return;
  }
  settings = data;
  $("site-title-input").value = data.site_title;
  $("subtitle-input").value = data.subtitle;
  $("instructions-input").value = data.instructions;
  $("show-amount-input").checked = data.show_amount;
  thumb($("back-preview"), data.card_back_path);
  thumb($("front-preview"), data.default_front_path);
  thumb($("intro-preview"), data.intro_image_path);
}
async function saveSettings(patch) {
  try {
    msg("Saving appearance...");
    const next = {
      site_title: $("site-title-input").value.trim() || "Daily Tarot",
      subtitle: $("subtitle-input").value.trim(),
      instructions: $("instructions-input").value.trim(),
      show_amount: $("show-amount-input").checked,
      updated_at: new Date().toISOString(),
      ...patch,
    };
    if ($("intro-file").files[0])
      next.intro_image_path = await upload($("intro-file").files[0]);
    if ($("back-file").files[0])
      next.card_back_path = await upload($("back-file").files[0]);
    if ($("default-front-file").files[0])
      next.default_front_path = await upload($("default-front-file").files[0]);
    const { error } = await db.from("tarot_settings").update(next).eq("id", 1);
    if (error) throw error;
    $("back-file").value = "";
    $("default-front-file").value = "";
    $("intro-file").value = "";
    msg("Appearance saved. Refresh the public website to see it.");
    await loadSettings();
  } catch (e) {
    msg("Could not save settings: " + e.message);
  }
}
$("save-settings").onclick = () => saveSettings({});
$("clear-intro").onclick = () => {
  if (confirm("Remove the username welcome image?"))
    saveSettings({ intro_image_path: null });
};
$("clear-back").onclick = () => {
  if (confirm("Remove the shared back image?"))
    saveSettings({ card_back_path: null });
};
$("clear-front").onclick = () => {
  if (confirm("Remove the default front image?"))
    saveSettings({ default_front_path: null });
};
$("add").onclick = async () => {
  try {
    const name = $("new-name").value.trim();
    if (!name || name.length > 80)
      throw Error("Enter a reward name of 1-80 characters.");
    const entry = {
      name,
      amount: requireNumber($("new-amount").value, "Tarot value", 1000000000),
      weight: requireNumber($("new-weight").value, "Weight"),
      display_text: $("new-text").value.trim() || name,
      show_text: $("new-show-text").checked,
      active: $("new-active").checked,
    };
    msg("Adding reward...");
    entry.front_image_path = await upload($("new-image").files[0]);
    entry.image_path = entry.front_image_path;
    const { error } = await db.from("rewards").insert(entry);
    if (error) throw error;
    $("new-name").value = "";
    $("new-text").value = "";
    $("new-image").value = "";
    msg("Reward added!");
    await loadRewards();
  } catch (e) {
    msg("Could not add reward: " + e.message);
  }
};
async function loadRewards() {
  const { data, error } = await db
    .from("rewards")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) {
    msg("Rewards: " + error.message);
    return;
  }
  rewards = data;
  renderRewards();
}
function renderRewards() {
  const current = $("rewards"),
    archive = $("archived-rewards");
  current.replaceChildren();
  archive.replaceChildren();
  const total = rewards
    .filter((r) => r.active && r.weight > 0)
    .reduce((n, r) => n + r.weight, 0);
  for (const r of rewards) {
    const wrap = el(
      "div",
      undefined,
      "reward-editor" + (r.active ? "" : " archived")
    );
    const head = el("div", undefined, "reward-heading");
    head.append(
      el("strong", r.name),
      el(
        "span",
        r.active && total
          ? `${((100 * r.weight) / total).toFixed(2)}% chance`
          : "Inactive",
        "hint"
      )
    );
    wrap.append(head);
    const grid = el("div", undefined, "reward-grid");
    const name = field(grid, "Internal name", r.name, "text", {
      maxLength: 80,
    });
    const amount = field(grid, "Tarot amount", r.amount, "number", { min: 0 });
    const weight = field(grid, "Probability weight", r.weight, "number", {
      min: 0,
      max: 100000,
    });
    const display = field(
      grid,
      "Optional display text",
      r.display_text ?? r.name,
      "text",
      { maxLength: 120 }
    );
    const show = field(grid, "Show text below card", r.show_text, "checkbox");
    const active = field(
      grid,
      "Enabled for future draws",
      r.active,
      "checkbox"
    );
    const file = field(grid, "Replace reward FRONT PNG", null, "file", {
      accept: "image/png",
    });
    const preview = el("div");
    thumb(preview, r.front_image_path || r.image_path);
    grid.append(preview);
    wrap.append(grid);
    const actions = el("div", undefined, "reward-actions");
    btn(actions, "Save changes", async () => {
      try {
        const n = name.value.trim();
        if (!n) throw Error("Name cannot be empty.");
        const updates = {
          name: n,
          amount: requireNumber(amount.value, "Amount", 1000000000),
          weight: requireNumber(weight.value, "Weight"),
          display_text: display.value.trim(),
          show_text: show.checked,
          active: active.checked,
        };
        if (file.files[0]) {
          updates.front_image_path = await upload(file.files[0]);
          updates.image_path = updates.front_image_path;
        }
        const { error } = await db
          .from("rewards")
          .update(updates)
          .eq("id", r.id);
        if (error) throw error;
        msg("Reward updated.");
        await loadRewards();
      } catch (e) {
        msg("Save failed: " + e.message);
      }
    });
    btn(
      actions,
      "Clear front PNG",
      async () => {
        if (!confirm("Clear the front image? The default front will be used."))
          return;
        const { error } = await db
          .from("rewards")
          .update({ front_image_path: null, image_path: null })
          .eq("id", r.id);
        if (error) msg(error.message);
        else {
          msg("Image cleared.");
          await loadRewards();
        }
      },
      true
    );
    btn(
      actions,
      r.active ? "Archive / disable" : "Restore",
      async () => {
        const { error } = await db
          .from("rewards")
          .update({ active: !r.active })
          .eq("id", r.id);
        if (error) msg(error.message);
        else {
          msg(r.active ? "Reward archived." : "Reward restored.");
          await loadRewards();
        }
      },
      true
    );
    btn(
      actions,
      "Delete permanently",
      async () => {
        if (
          !confirm(
            "Permanently delete this reward? Rewards used by existing draws cannot be deleted. Archive instead."
          )
        )
          return;
        const { error } = await db.from("rewards").delete().eq("id", r.id);
        if (error)
          msg(
            "Cannot delete: " +
              error.message +
              ". Archive to preserve historical draws."
          );
        else {
          msg("Unused reward deleted.");
          await loadRewards();
        }
      },
      true
    );
    wrap.append(actions);
    (r.active ? current : archive).append(wrap);
  }
  if (!current.children.length)
    current.append(
      el("p", "No enabled rewards. Add or restore a reward.", "hint")
    );
  if (!archive.children.length)
    archive.append(el("p", "No archived rewards.", "hint"));
}
const gmt3 = (iso) =>
  new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Amman",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  }).format(new Date(iso));
const utc = (iso) =>
  new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  }).format(new Date(iso));
async function loadHistory(reset = false) {
  if (reset) {
    draws = [];
    drawOffset = 0;
    loadedAll = false;
  }
  if (loadedAll) return;
  const { data, error } = await db
    .from("draws")
    .select(
      "id,username,browser_id,reward_name,reward_amount,draw_day,created_at"
    )
    .order("created_at", { ascending: false })
    .range(drawOffset, drawOffset + PAGE - 1);
  if (error) {
    msg("Draw records: " + error.message);
    return;
  }
  draws.push(...data);
  drawOffset += data.length;
  if (data.length < PAGE) loadedAll = true;
  renderHistory();
}
function renderHistory() {
  const term = $("search-history").value.trim().toLowerCase();
  const chosen = draws.filter(
    (d) => !term || (d.username || "").toLowerCase().includes(term)
  );
  const body = $("history");
  body.replaceChildren();
  for (const d of chosen) {
    const tr = document.createElement("tr");
    [
      d.username || "(legacy / no username)",
      d.browser_id || "(legacy)",
      d.reward_name,
      d.reward_amount,
      gmt3(d.created_at),
      utc(d.created_at),
      d.draw_day,
    ].forEach((value) => tr.append(el("td", String(value ?? ""))));
    body.append(tr);
  }
  $("stats").textContent = `Loaded ${draws.length} draw records; ${ new Set(draws.map((d) => d.username).filter(Boolean)).size } distinct usernames among loaded records.`;
  $("history-count").textContent = loadedAll
    ? "All records loaded"
    : `${draws.length} loaded; more available`;
  $("load-more").disabled = loadedAll;
}
$("search-history").oninput = renderHistory;
$("refresh-history").onclick = () => loadHistory(true);
$("load-more").onclick = () => loadHistory(false);
$("reload").onclick = loadRewards;
$("export-history").onclick = () => {
  const header = [
    "Username",
    "Browser ID",
    "Reward",
    "Tarot amount",
    "GMT+3 timestamp",
    "UTC timestamp",
    "Stored draw day (legacy Pacific / new GMT+3)",
  ];
  const rows = draws.map((d) => [
    d.username || "",
    d.browser_id || "",
    d.reward_name,
    d.reward_amount,
    gmt3(d.created_at),
    utc(d.created_at),
    d.draw_day,
  ]);
  const csv = [header, ...rows]
    .map((row) =>
      row
        .map((v) => '"' + String(v ?? "").replaceAll('"', '""') + '"')
        .join(",")
    )
    .join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(
    new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" })
  );
  a.download = "daily-tarot-draws.csv";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  msg(
    "CSV exported for records currently loaded. Use Load more before exporting full history."
  );
};
check();
