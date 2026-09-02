// 화면 로직 · 로컬 저장. docs/PLAN.md §6(AC-4~AC-15) 참고.
import { evaluate, summarize, sortServices, classifyDeadlineUrgency } from "./filter.js";
import { REGIONS, ALL_REGIONS_LABEL } from "./regions.js";

const DISCLAIMER_PREFIX =
  "이 목록은 조건에서 걸러지지 않은 사업이며 실제 지급 여부는 담당 기관이 판단합니다.";
const STALE_DAYS = 7;
const PAGE_SIZE = 50;
const COMPARE_MAX = 4;
const HOUSEHOLD_ITEMS = ["다문화가족", "북한이탈주민", "한부모", "1인가구", "다자녀", "무주택", "신규전입"];

const LS_KEYS = {
  criteria: "gov24filter:criteria",
  saved: "gov24filter:saved",
  compare: "gov24filter:compare",
};

const DEFAULT_CRITERIA = {
  region: ALL_REGIONS_LABEL,
  userType: "개인",
  business: "",
  age: "",
  gender: "",
  income: "",
  household: [],
  fields: [],
  keyword: "",
};

const state = {
  snapshot: null, // { meta, services }
  metaJson: null,
  changesJson: null,
  criteria: loadJSON(LS_KEYS.criteria, DEFAULT_CRITERIA),
  saved: loadJSON(LS_KEYS.saved, []),
  compareIds: loadJSON(LS_KEYS.compare, []),
  sortKey: "default",
  groupLimits: { matched: PAGE_SIZE, unknown: PAGE_SIZE, excluded: PAGE_SIZE },
  lastGroups: { matched: [], unknown: [], excluded: [] },
  detailId: null,
  loaded: false,
};

// ---------- 유틸 ----------

function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch (e) {
    return fallback;
  }
}

function saveJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    // 저장 공간 부족 등은 조용히 무시 — 화면 기능은 계속 동작해야 한다
  }
}

function esc(s) {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// 원문 링크는 http(s) 만 허용한다. javascript: 등 다른 스킴은 링크로 만들지 않는다 (REVIEW-1 #3).
export function safeHref(url) {
  if (url == null) return null;
  const s = String(url).trim();
  if (!/^https?:\/\//i.test(s)) return null;
  return esc(s);
}

function getServiceId(service) {
  return service && service["서비스ID"];
}

function findService(id) {
  if (!state.snapshot) return null;
  return state.snapshot.services.find((s) => getServiceId(s) === id) || null;
}

function formatDateOnly(iso) {
  if (!iso) return "[데이터공백]";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toISOString().slice(0, 10);
}

function formatDateTime(iso) {
  if (!iso) return "[데이터공백]";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString("ko-KR");
}

function isStale(iso) {
  if (!iso) return false;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  const diffDays = (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24);
  return diffDays > STALE_DAYS;
}

function disclaimerText() {
  const fetchedAt = state.snapshot ? state.snapshot.meta.fetched_at : null;
  return `${DISCLAIMER_PREFIX} 데이터 기준일: ${formatDateOnly(fetchedAt)}`;
}

// 고정 안내문 자체는 index.html에 정적으로 박혀 있다(닫기 버튼 없음, JS 없이도 문구는 보임).
// 여기서는 그 안의 기준일 <span class="js-fetched-date"> 부분만 채운다.
function fillDisclaimerDate(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const span = container.querySelector(".js-fetched-date");
  const fetchedAt = state.snapshot ? state.snapshot.meta.fetched_at : null;
  const text = formatDateOnly(fetchedAt);
  if (span) span.textContent = text;
  else container.textContent = disclaimerText();
}

function splitDocList(raw) {
  if (!raw || !String(raw).trim()) return ["서류 정보 없음, 원문 확인"];
  return String(raw)
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// ---------- 데이터 로드 ----------

async function fetchJSONOptional(path) {
  try {
    const res = await fetch(path, { cache: "no-store" });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    return null;
  }
}

async function loadAll() {
  const errorBox = document.getElementById("load-error");
  try {
    const res = await fetch("data/snapshot.json", { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const snapshot = await res.json();
    if (!snapshot || !Array.isArray(snapshot.services) || !snapshot.meta) {
      throw new Error("스냅샷 형식이 올바르지 않습니다");
    }
    state.snapshot = snapshot;
    state.metaJson = await fetchJSONOptional("data/meta.json");
    state.changesJson = await fetchJSONOptional("data/changes.json");
    state.loaded = true;
    errorBox.hidden = true;
  } catch (e) {
    state.loaded = false;
    errorBox.hidden = false;
    errorBox.textContent =
      "데이터를 불러오지 못했습니다. file:// 로 직접 열었다면 로컬 서버(예: python3 -m http.server)로 열어주세요. " +
      `(${e && e.message ? e.message : e})`;
  }
}

function renderTopBanners() {
  const sampleBanner = document.getElementById("sample-banner");
  const staleBanner = document.getElementById("stale-banner");
  if (!state.snapshot) {
    sampleBanner.hidden = true;
    staleBanner.hidden = true;
    return;
  }
  const meta = state.snapshot.meta;
  if (meta.sample) {
    sampleBanner.hidden = false;
    sampleBanner.textContent = `표본 데이터(${state.snapshot.services.length}건) 기준 — 실데이터 수집 전`;
  } else {
    sampleBanner.hidden = true;
  }
  if (isStale(meta.fetched_at)) {
    staleBanner.hidden = false;
    staleBanner.textContent = `데이터가 오래되었습니다 (기준일 ${formatDateOnly(meta.fetched_at)}, ${STALE_DAYS}일 초과).`;
  } else {
    staleBanner.hidden = true;
  }
}

// ---------- 조건 폼 ----------

function populateFieldOptions() {
  const select = document.getElementById("f-fields");
  select.innerHTML = "";
  if (!state.snapshot) return;
  const values = new Set();
  for (const s of state.snapshot.services) {
    const raw = s["서비스분야"];
    if (!raw) continue;
    String(raw)
      .split(/[,|/]+/)
      .map((v) => v.trim())
      .filter(Boolean)
      .forEach((v) => values.add(v));
  }
  Array.from(values)
    .sort((a, b) => a.localeCompare(b, "ko"))
    .forEach((v) => {
      const opt = document.createElement("option");
      opt.value = v;
      opt.textContent = v;
      if (state.criteria.fields.includes(v)) opt.selected = true;
      select.appendChild(opt);
    });
}

function populateRegionOptions() {
  const select = document.getElementById("f-region");
  select.innerHTML = "";
  const allOpt = document.createElement("option");
  allOpt.value = ALL_REGIONS_LABEL;
  allOpt.textContent = ALL_REGIONS_LABEL;
  select.appendChild(allOpt);
  for (const r of REGIONS) {
    const opt = document.createElement("option");
    opt.value = r;
    opt.textContent = r;
    select.appendChild(opt);
  }
  select.value = state.criteria.region || ALL_REGIONS_LABEL;
}

function fillFormFromCriteria() {
  const c = state.criteria;
  document.getElementById("f-region").value = c.region || ALL_REGIONS_LABEL;
  document.querySelectorAll('input[name="userType"]').forEach((el) => {
    el.checked = el.value === c.userType;
  });
  document.getElementById("f-business").value = c.business || "";
  document.getElementById("f-age").value = c.age || "";
  document.querySelectorAll('input[name="gender"]').forEach((el) => {
    el.checked = el.value === (c.gender || "");
  });
  document.getElementById("f-income").value = c.income || "";
  document.querySelectorAll('input[name="household"]').forEach((el) => {
    el.checked = c.household.includes(el.value);
  });
  document.getElementById("f-keyword").value = c.keyword || "";
  toggleBusinessGroup();
}

function toggleBusinessGroup() {
  const userType = document.querySelector('input[name="userType"]:checked');
  const group = document.getElementById("business-group");
  group.hidden = !(userType && userType.value === "소상공인");
}

function readCriteriaFromForm() {
  const form = document.getElementById("criteria-form");
  const fd = new FormData(form);
  const household = fd.getAll("household");
  const fieldsSelect = document.getElementById("f-fields");
  const fields = Array.from(fieldsSelect.selectedOptions).map((o) => o.value);
  return {
    region: fd.get("region") || ALL_REGIONS_LABEL,
    userType: fd.get("userType") || "",
    business: fd.get("business") || "",
    age: fd.get("age") || "",
    gender: fd.get("gender") || "",
    income: fd.get("income") || "",
    household,
    fields,
    keyword: (fd.get("keyword") || "").trim(),
  };
}

// ---------- 검색 결과 렌더 ----------

function computeAllResults() {
  if (!state.snapshot) return [];
  return state.snapshot.services.map((service) => ({
    service,
    result: evaluate(service, state.criteria),
  }));
}

function badgeClass(status) {
  if (status === "일치") return "badge badge-match";
  if (status === "미확정") return "badge badge-unknown";
  if (status === "불일치" || status === "제외") return "badge badge-mismatch";
  return "badge";
}

function deadlineLabel(service) {
  if (service.deadline_kind === "기간") {
    return service.deadline_date ? `~${formatDateOnly(service.deadline_date)}` : "기간(날짜 미확인)";
  }
  if (service.deadline_kind === "상시") return "상시";
  return "불명";
}

function renderCard(entry) {
  const { service, result } = entry;
  const id = getServiceId(service);
  const isSaved = state.saved.some((s) => s.id === id);
  const isCompared = state.compareIds.includes(id);
  const urgency = classifyDeadlineUrgency(service);
  const li = document.createElement("li");
  li.className = "card";
  li.dataset.id = id;
  li.innerHTML = `
    <div class="card-main">
      <h3 class="card-title">${esc(service["서비스명"])}</h3>
      <p class="card-org">${esc(service["소관기관명"] || "")}</p>
      <div class="card-badges">
        <span class="${badgeClass(result.status)}">${esc(result.status)}</span>
        <span class="badge badge-region">${esc(service.region || "지역 미확정")}</span>
        <span class="badge badge-deadline">${esc(deadlineLabel(service))}</span>
        ${urgency ? `<span class="badge ${urgency === "마감 지남" ? "badge-expired" : "badge-urgent"}">${esc(urgency)}</span>` : ""}
      </div>
    </div>
    <div class="card-actions">
      <label class="compare-check">
        <input type="checkbox" class="js-compare" ${isCompared ? "checked" : ""} />
        비교
      </label>
      <button type="button" class="btn btn-save ${isSaved ? "is-saved" : ""}">${isSaved ? "저장됨" : "저장"}</button>
    </div>
  `;
  return li;
}

function renderGroup(groupKey, listElId, countElId, entries) {
  state.lastGroups[groupKey] = entries;
  const list = document.getElementById(listElId);
  const countEl = document.getElementById(countElId);
  countEl.textContent = String(entries.length);
  list.innerHTML = "";
  const limit = state.groupLimits[groupKey];
  const slice = entries.slice(0, limit);
  const frag = document.createDocumentFragment();
  for (const entry of slice) {
    frag.appendChild(renderCard(entry));
  }
  list.appendChild(frag);
  const moreBtn = document.querySelector(`.btn-more[data-group="${groupKey}"]`);
  moreBtn.hidden = entries.length <= limit;
}

function runSearch() {
  fillDisclaimerDate("disclaimer-results");
  if (!state.snapshot) return;

  const all = computeAllResults();
  const summary = summarize(all.map((e) => e.result));

  const summaryLine = document.getElementById("summary-line");
  summaryLine.hidden = false;
  document.getElementById("summary-text").textContent =
    `적용 조건 · 전체 ${summary.total} · 일치 ${summary.matched} · 미확정 ${summary.unknown} · 제외 ${summary.excluded}`;

  const matched = all.filter((e) => e.result.status === "일치");
  const unknown = all.filter((e) => e.result.status === "미확정");
  const excluded = all.filter((e) => e.result.status === "제외");

  const context = { region: state.criteria.region !== ALL_REGIONS_LABEL ? state.criteria.region : undefined };
  const sortKey = state.sortKey === "default" ? undefined : state.sortKey;

  state.groupLimits = { matched: PAGE_SIZE, unknown: PAGE_SIZE, excluded: PAGE_SIZE };
  renderGroup("matched", "list-matched", "count-matched", sortServices(matched, sortKey, context));
  renderGroup("unknown", "list-unknown", "count-unknown", sortServices(unknown, sortKey, context));
  renderGroup("excluded", "list-excluded", "count-excluded", sortServices(excluded, sortKey, context));
}

// ---------- 저장(관심) ----------

function toggleSaved(id) {
  const idx = state.saved.findIndex((s) => s.id === id);
  if (idx >= 0) {
    state.saved.splice(idx, 1);
  } else {
    const service = findService(id);
    if (!service) return;
    state.saved.push({
      id,
      saved_at: new Date().toISOString(),
      status: "관심",
      memo: "",
      docs: {},
      snapshot: {
        서비스명: service["서비스명"],
        소관기관명: service["소관기관명"],
        region: service.region,
        deadline_kind: service.deadline_kind,
        deadline_date: service.deadline_date,
        구비서류: service["구비서류"],
        상세조회URL: service["상세조회URL"],
      },
    });
  }
  saveJSON(LS_KEYS.saved, state.saved);
}

function toggleCompare(id) {
  const idx = state.compareIds.indexOf(id);
  const notice = document.getElementById("compare-notice");
  if (idx >= 0) {
    state.compareIds.splice(idx, 1);
    notice.hidden = true;
  } else {
    if (state.compareIds.length >= COMPARE_MAX) {
      notice.hidden = false;
      return false;
    }
    state.compareIds.push(id);
    notice.hidden = true;
  }
  saveJSON(LS_KEYS.compare, state.compareIds);
  return true;
}

// ---------- 상세 패널 ----------

function openDetail(id) {
  state.detailId = id;
  renderDetail();
  document.getElementById("detail-panel").hidden = false;
  document.getElementById("tab-search").hidden = true;
}

function closeDetail() {
  state.detailId = null;
  document.getElementById("detail-panel").hidden = true;
  document.getElementById("tab-search").hidden = false;
}

function renderDetail() {
  const id = state.detailId;
  const service = findService(id);
  const body = document.getElementById("detail-body");
  fillDisclaimerDate("disclaimer-detail-top");
  fillDisclaimerDate("disclaimer-detail-bottom");

  if (!service) {
    body.innerHTML = `<p>해당 사업을 현재 스냅샷에서 찾을 수 없습니다. 출처에서 사라졌을 수 있습니다.</p>`;
    return;
  }

  const result = evaluate(service, state.criteria);
  const matchedItems = result.items.filter((i) => i.status === "일치");
  const uncertainItems = result.items.filter((i) => i.status === "판정불가");

  const links = [];
  const detailHref = safeHref(service["상세조회URL"]);
  const applyHref = safeHref(service["온라인신청사이트URL"]);
  if (detailHref) {
    links.push(`<a href="${detailHref}" target="_blank" rel="noopener">원문 상세조회</a>`);
  }
  if (applyHref) {
    links.push(`<a href="${applyHref}" target="_blank" rel="noopener">온라인 신청</a>`);
  }
  if (!detailHref && !applyHref) {
    links.push(`<span class="muted">출처 링크 없음 — 제공 기관명으로 정부24(gov.kr)에서 검색</span>`);
  }

  const fetchedAt = state.snapshot ? state.snapshot.meta.fetched_at : null;

  body.innerHTML = `
    <h2>${esc(service["서비스명"])}</h2>
    <p class="detail-sub">${esc(service["소관기관명"] || "")} · ${esc(service["부서명"] || "")}</p>
    <p class="detail-links">${links.join(" · ") || "원문 링크 없음"}</p>
    <p class="detail-meta">데이터 기준일 ${esc(formatDateOnly(fetchedAt))} · 수집 시각 ${esc(formatDateTime(fetchedAt))}</p>

    <section class="detail-section">
      <h3>일치한 조건</h3>
      ${
        matchedItems.length
          ? `<ul>${matchedItems.map((i) => `<li><span class="${badgeClass(i.status)}">${esc(i.status)}</span> ${esc(i.label)} — ${esc(i.evidence)}</li>`).join("")}</ul>`
          : "<p>조건에서 걸러지지 않음 — 일치로 확인된 항목이 없습니다.</p>"
      }
    </section>

    <section class="detail-section">
      <h3>원문 자격요건</h3>
      <p><strong>지원대상</strong><br>${esc(service["지원대상"]) || "[데이터공백]"}</p>
      <p><strong>선정기준</strong><br>${esc(service["선정기준"]) || "[데이터공백]"}</p>
    </section>

    <section class="detail-section">
      <h3>미확정 항목</h3>
      ${
        uncertainItems.length
          ? `<ul>${uncertainItems
              .map(
                (i) =>
                  `<li><span class="${badgeClass(i.status)}">${esc(i.status)}</span> ${esc(i.label)} — ${esc(i.evidence)}` +
                  (detailHref
                    ? ` <a href="${detailHref}" target="_blank" rel="noopener">원문에서 확인</a>`
                    : "") +
                  `</li>`
              )
              .join("")}</ul>`
          : "<p>미확정 항목이 없습니다.</p>"
      }
    </section>

    <section class="detail-section">
      <h3>신청 요구사항</h3>
      <p><strong>신청방법</strong><br>${esc(service["신청방법"]) || "[데이터공백]"}</p>
      <p><strong>구비서류</strong><br>${esc(service["구비서류"]) || "[데이터공백]"}</p>
      <p><strong>접수기관</strong> ${esc(service["접수기관"]) || "[데이터공백]"}</p>
      <p><strong>전화문의</strong> ${esc(service["전화문의"]) || "[데이터공백]"}</p>
    </section>

    <div class="detail-actions">
      <label class="compare-check"><input type="checkbox" id="detail-compare" ${state.compareIds.includes(id) ? "checked" : ""} /> 비교에 추가</label>
      <button type="button" id="detail-save" class="btn btn-save">${state.saved.some((s) => s.id === id) ? "저장됨" : "저장"}</button>
    </div>
  `;

  document.getElementById("detail-save").addEventListener("click", () => {
    toggleSaved(id);
    renderDetail();
    runSearch();
  });
  document.getElementById("detail-compare").addEventListener("change", (e) => {
    const ok = toggleCompare(id);
    if (!ok) e.target.checked = false;
  });
}

// ---------- 관심 탭 ----------

function renderSaved() {
  const body = document.getElementById("saved-body");
  if (state.saved.length === 0) {
    body.innerHTML = "<p>저장한 사업이 없습니다.</p>";
    return;
  }

  const today = new Date();
  const enriched = state.saved.map((entry) => {
    const live = findService(entry.id);
    const removed = state.loaded && !live;
    const view = live
      ? {
          name: live["서비스명"],
          org: live["소관기관명"],
          deadline_kind: live.deadline_kind,
          deadline_date: live.deadline_date,
          docsRaw: live["구비서류"],
        }
      : {
          name: entry.snapshot.서비스명,
          org: entry.snapshot.소관기관명,
          deadline_kind: entry.snapshot.deadline_kind,
          deadline_date: entry.snapshot.deadline_date,
          docsRaw: entry.snapshot.구비서류,
        };
    const expired =
      view.deadline_kind === "기간" && view.deadline_date && new Date(view.deadline_date) < today;
    return { entry, view, removed, expired };
  });

  const active = enriched.filter((e) => !e.expired);
  const expired = enriched.filter((e) => e.expired);

  active.sort((a, b) => {
    const ta = a.view.deadline_date ? new Date(a.view.deadline_date).getTime() : Infinity;
    const tb = b.view.deadline_date ? new Date(b.view.deadline_date).getTime() : Infinity;
    return ta - tb;
  });

  function renderSection(title, items) {
    if (items.length === 0) return "";
    return `<h3>${esc(title)}</h3><ul class="card-list saved-list">${items.map((i) => renderSavedCard(i)).join("")}</ul>`;
  }

  body.innerHTML = renderSection("진행 중", active) + renderSection("기한 만료", expired);

  body.querySelectorAll("[data-saved-id]").forEach((card) => {
    const id = card.dataset.savedId;
    const entry = state.saved.find((s) => s.id === id);
    if (!entry) return;
    card.querySelector(".js-status").addEventListener("change", (e) => {
      entry.status = e.target.value;
      saveJSON(LS_KEYS.saved, state.saved);
    });
    card.querySelectorAll(".js-doc-check").forEach((chk) => {
      chk.addEventListener("change", (e) => {
        entry.docs = entry.docs || {};
        entry.docs[e.target.value] = e.target.checked;
        saveJSON(LS_KEYS.saved, state.saved);
      });
    });
    card.querySelector(".js-unsave").addEventListener("click", () => {
      toggleSaved(id);
      renderSaved();
    });
  });
}

function renderSavedCard({ entry, view, removed }) {
  const docs = splitDocList(view.docsRaw);
  const statusOptions = ["관심", "준비 중", "신청 완료", "확인 필요"];
  return `
    <li class="card saved-card" data-saved-id="${esc(entry.id)}">
      <div class="card-main">
        <h3 class="card-title">${esc(view.name)}</h3>
        <p class="card-org">${esc(view.org || "")}</p>
        ${removed ? `<span class="badge badge-mismatch">출처에서 사라짐</span>` : ""}
        <p class="card-org">마감: ${esc(view.deadline_kind === "기간" ? formatDateOnly(view.deadline_date) : view.deadline_kind)}</p>
        <label>
          진행 상태
          <select class="js-status">
            ${statusOptions.map((s) => `<option value="${esc(s)}" ${entry.status === s ? "selected" : ""}>${esc(s)}</option>`).join("")}
          </select>
        </label>
        <div class="doc-checklist">
          ${docs
            .map(
              (d, idx) =>
                `<label><input type="checkbox" class="js-doc-check" value="${esc(d)}" ${entry.docs && entry.docs[d] ? "checked" : ""} /> ${esc(d)}</label>`
            )
            .join("")}
        </div>
      </div>
      <div class="card-actions">
        <button type="button" class="btn btn-secondary js-unsave">저장 해제</button>
      </div>
    </li>
  `;
}

// ---------- 비교 탭 ----------

function renderCompare() {
  fillDisclaimerDate("disclaimer-compare");
  const body = document.getElementById("compare-body");
  if (state.compareIds.length < 2) {
    body.innerHTML = "<p>비교하려면 검색 결과에서 2개 이상(최대 4개)을 선택하세요.</p>";
    return;
  }
  const services = state.compareIds.map((id) => findService(id)).filter(Boolean);
  if (services.length < 2) {
    body.innerHTML = "<p>선택한 사업을 현재 스냅샷에서 찾을 수 없습니다.</p>";
    return;
  }

  const rows = [
    ["지원대상", (s) => s["지원대상"]],
    ["지원내용", (s) => s["지원내용"]],
    ["신청기한", (s) => (s.deadline_kind === "기간" ? formatDateOnly(s.deadline_date) : s.deadline_kind)],
    ["지역", (s) => s.region || "지역 미확정"],
    ["지원유형", (s) => s["지원유형"]],
    ["구비서류", (s) => s["구비서류"]],
    [
      "미확정 항목",
      (s) => {
        const r = evaluate(s, state.criteria);
        const items = r.items.filter((i) => i.status === "판정불가");
        return items.length ? items.map((i) => i.label).join(", ") : "없음";
      },
    ],
  ];

  const table = document.createElement("table");
  table.className = "compare-table";
  const thead = document.createElement("thead");
  thead.innerHTML = `<tr><th></th>${services.map((s) => `<th>${esc(s["서비스명"])}</th>`).join("")}</tr>`;
  table.appendChild(thead);
  const tbody = document.createElement("tbody");
  for (const [label, getter] of rows) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<th>${esc(label)}</th>${services.map((s) => `<td>${esc(getter(s)) || "[데이터공백]"}</td>`).join("")}`;
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);

  body.innerHTML = "";
  const scrollWrap = document.createElement("div");
  scrollWrap.className = "table-scroll";
  scrollWrap.appendChild(table);
  body.appendChild(scrollWrap);
}

// ---------- 변경 사항 탭 ----------

function renderChanges() {
  const body = document.getElementById("changes-body");
  const changes = state.changesJson;
  if (!changes) {
    body.innerHTML = "<p>아직 비교할 이전 스냅샷이 없습니다.</p>";
  } else {
    const newList = changes.new || [];
    const removedList = changes.removed || [];
    const changedList = changes.changed || [];
    body.innerHTML = `
      <p>비교 시각: ${esc(formatDateTime(changes.compared_at))} · 직전 기준일: ${esc(formatDateOnly(changes.prev_fetched_at))}</p>
      <h3>신규 (${newList.length}건)</h3>
      <ul>${newList.map((n) => `<li>${esc(n.name)}</li>`).join("") || "<li>없음</li>"}</ul>
      <h3>변경 (${changedList.length}건)</h3>
      <ul>${
        changedList
          .map(
            (c) =>
              `<li>${esc(c.name)}<ul>${(c.fields || [])
                .map((f) => `<li>${esc(f.field)}: "${esc(f.before)}" → "${esc(f.after)}"</li>`)
                .join("")}</ul></li>`
          )
          .join("") || "<li>없음</li>"
      }</ul>
      <h3>소멸 (${removedList.length}건)</h3>
      <ul>${removedList.map((r) => `<li>${esc(r.name)}</li>`).join("") || "<li>없음</li>"}</ul>
    `;
  }

  const urgentBody = document.getElementById("urgent-body");
  if (!state.snapshot) {
    urgentBody.innerHTML = "<p>[데이터공백]</p>";
    return;
  }
  const urgent = state.snapshot.services
    .map((s) => ({ s, urgency: classifyDeadlineUrgency(s) }))
    .filter((x) => x.urgency && x.urgency !== "마감 지남")
    .sort((a, b) => new Date(a.s.deadline_date) - new Date(b.s.deadline_date));
  urgentBody.innerHTML = urgent.length
    ? `<ul>${urgent
        .map((x) => `<li><span class="badge badge-urgent">${esc(x.urgency)}</span> ${esc(x.s["서비스명"])} (~${esc(formatDateOnly(x.s.deadline_date))})</li>`)
        .join("")}</ul>`
    : "<p>마감 임박 사업이 없습니다.</p>";
}

// ---------- 데이터 상태 탭 ----------

function renderStatus() {
  const body = document.getElementById("status-body");
  const meta = state.metaJson || (state.snapshot ? state.snapshot.meta : null);
  if (!meta) {
    body.innerHTML = "<p>[데이터공백] meta.json 을 불러오지 못했습니다.</p>";
    return;
  }
  const warnings = meta.warnings || [];
  body.innerHTML = `
    <table class="status-table">
      <tr><th>수집 시각</th><td>${esc(formatDateTime(meta.fetched_at))}</td></tr>
      <tr><th>출처</th><td>${esc(meta.source) || "[데이터공백]"}</td></tr>
      <tr><th>전체 건수</th><td>${esc(meta.total_count)}</td></tr>
      <tr><th>수신 건수</th><td>${esc(meta.received)}</td></tr>
      <tr><th>고유 ID 수</th><td>${esc(meta.unique_ids)}</td></tr>
      <tr><th>건수 대조</th><td>${esc(meta.count_check) || "[데이터공백]"}</td></tr>
      <tr><th>지역 미확정 비율</th><td>${meta.region_unresolved_ratio != null ? `${(meta.region_unresolved_ratio * 100).toFixed(1)}%` : "[데이터공백]"}</td></tr>
      <tr><th>표본 데이터 여부</th><td>${meta.sample ? "예" : "아니오"}</td></tr>
    </table>
    <h3>경고</h3>
    ${warnings.length ? `<ul>${warnings.map((w) => `<li>${esc(w)}</li>`).join("")}</ul>` : "<p>없음</p>"}
  `;
}

// ---------- 탭 전환 ----------

function switchTab(tabName) {
  const panels = {
    search: "tab-search",
    saved: "tab-saved",
    compare: "tab-compare",
    changes: "tab-changes",
    status: "tab-status",
  };
  closeDetail();
  Object.entries(panels).forEach(([name, id]) => {
    document.getElementById(id).hidden = name !== tabName;
  });
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    const active = btn.dataset.tab === tabName;
    btn.classList.toggle("is-active", active);
    btn.setAttribute("aria-selected", active ? "true" : "false");
  });
  if (tabName === "saved") renderSaved();
  if (tabName === "compare") renderCompare();
  if (tabName === "changes") renderChanges();
  if (tabName === "status") renderStatus();
}

// ---------- 이벤트 위임 ----------

function wireResultLists() {
  ["list-matched", "list-unknown", "list-excluded"].forEach((listId) => {
    const list = document.getElementById(listId);
    list.addEventListener("click", (e) => {
      const card = e.target.closest(".card");
      if (!card) return;
      const id = card.dataset.id;

      if (e.target.classList.contains("js-compare")) {
        const ok = toggleCompare(id);
        if (!ok) e.target.checked = false;
        return;
      }
      if (e.target.classList.contains("btn-save")) {
        toggleSaved(id);
        e.target.textContent = state.saved.some((s) => s.id === id) ? "저장됨" : "저장";
        e.target.classList.toggle("is-saved");
        return;
      }
      openDetail(id);
    });
  });

  document.querySelectorAll(".btn-more").forEach((btn) => {
    btn.addEventListener("click", () => {
      const group = btn.dataset.group;
      state.groupLimits[group] += PAGE_SIZE;
      const listIds = { matched: "list-matched", unknown: "list-unknown", excluded: "list-excluded" };
      const countIds = { matched: "count-matched", unknown: "count-unknown", excluded: "count-excluded" };
      renderGroup(group, listIds[group], countIds[group], state.lastGroups[group]);
    });
  });
}

function wireForm() {
  const form = document.getElementById("criteria-form");
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    state.criteria = readCriteriaFromForm();
    saveJSON(LS_KEYS.criteria, state.criteria);
    runSearch();
  });

  document.getElementById("btn-reset").addEventListener("click", () => {
    state.criteria = Object.assign({}, DEFAULT_CRITERIA);
    saveJSON(LS_KEYS.criteria, state.criteria);
    fillFormFromCriteria();
    runSearch();
  });

  document.querySelectorAll('input[name="userType"]').forEach((el) => {
    el.addEventListener("change", toggleBusinessGroup);
  });

  document.getElementById("sort-select").addEventListener("change", (e) => {
    state.sortKey = e.target.value;
    runSearch();
  });
}

function wireTabs() {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });
  document.getElementById("detail-close").addEventListener("click", closeDetail);
}

// ---------- 초기화 ----------

async function init() {
  wireTabs();
  wireForm();
  wireResultLists();

  await loadAll();
  renderTopBanners();

  if (state.loaded) {
    populateRegionOptions();
    populateFieldOptions();
    fillFormFromCriteria();
    document.getElementById("sort-select").value = state.sortKey;
    runSearch();
  } else {
    fillDisclaimerDate("disclaimer-results");
  }
}

if (typeof document !== "undefined") {
  init();
}
