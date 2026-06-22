const STORAGE_KEY = "diligence-ai-launch-portal-state";
const seedDate = "2026-06-20T00:00:00.000Z";
const MASKED_PEOPLE_URL = "./data/masked-people.json";

let activeTab = "people";
let notice = null;
let verifyResult = null;
let editPersonId = "";
let editCapacityId = "";
let editRepositoryId = "";
let assignmentPersonId = "";
let workerSearch = "";
let draftPersonVisible = false;
let draftCapacityVisible = false;
let draftRepositoryVisible = false;
let selectedPersonId = "";
let selectedCapacityId = "";
let selectedRepositoryId = "";
let peopleSkillFilterId = "";

const app = document.getElementById("app");

function createInitialState() {
  return {
    people: [],
    capacities: [
      {
        id: "cap-sme",
        name: "SME",
        description: "Subject matter expert for launch, validation, and knowledge quality.",
        status: "Active",
        createdAt: seedDate,
        updatedAt: seedDate,
      },
      {
        id: "cap-operator",
        name: "Operator",
        description: "Hands-on operator for pilot execution and day-to-day use.",
        status: "Active",
        createdAt: seedDate,
        updatedAt: seedDate,
      },
    ],
    assignments: [],
    repositories: [],
    workers: [],
    audit: [],
    actor: "Pilot Admin",
    workbookName: "diligence-ai-launch-portal.xlsx",
    workerSource: "",
    workerSourceMode: "",
    workerImportedAt: "",
    workerSourceUpdatedAt: "",
    lastSavedAt: "",
  };
}

let state = loadState();

function loadState() {
  const initial = createInitialState();
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return initial;

  try {
    const parsed = JSON.parse(raw);
    return {
      ...initial,
      ...parsed,
      people: Array.isArray(parsed.people) ? parsed.people : [],
      capacities: Array.isArray(parsed.capacities) && parsed.capacities.length ? parsed.capacities : initial.capacities,
      assignments: Array.isArray(parsed.assignments) ? parsed.assignments : [],
      repositories: Array.isArray(parsed.repositories) ? parsed.repositories : [],
      workers: Array.isArray(parsed.workers) ? parsed.workers : [],
      audit: Array.isArray(parsed.audit) ? parsed.audit : [],
    };
  } catch {
    return initial;
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function createId(prefix) {
  if (crypto.randomUUID) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char]);
}

function icon(name) {
  return `<i data-lucide="${name}"></i>`;
}

function normalizeName(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeHeader(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function workerKey(fullName, email, workerId) {
  if (String(email || "").trim()) return `email:${String(email).toLowerCase().trim()}`;
  if (String(workerId || "").trim()) return `worker:${String(workerId).toLowerCase().trim()}`;
  return `name:${normalizeName(fullName)}`;
}

function workerLabel(worker) {
  return [worker.fullName, worker.email, worker.title].filter(Boolean).join(" | ");
}

function workerFromSearchValue(value) {
  const trimmed = String(value || "").trim();
  const lower = trimmed.toLowerCase();
  const normalized = normalizeName(trimmed);
  if (!trimmed) return null;

  const matches = state.workers.filter((worker) =>
    workerLabel(worker) === trimmed ||
    String(worker.email || "").toLowerCase() === lower ||
    normalizeName(worker.fullName) === normalized ||
    normalizeName(workerLabel(worker)) === normalized
  );

  return matches.length === 1 ? matches[0] : null;
}

function findPersonForWorker(worker) {
  if (!worker) return null;
  return state.people.find((person) => person.workerKey === worker.id) ||
    state.people.find((person) => person.email && worker.email && person.email.toLowerCase() === worker.email.toLowerCase()) ||
    state.people.find((person) => normalizeName(person.fullName) === normalizeName(worker.fullName));
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function formatDateTime(value) {
  if (!value) return "Not saved";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function statusPill(status) {
  const lower = String(status || "").toLowerCase();
  const tone = lower === "y" || lower.includes("matched") || lower.includes("active") || lower.includes("connected")
    ? "good"
    : lower === "ip" || lower.includes("pending") || lower.includes("candidate") || lower.includes("selected")
      ? "neutral"
      : "warn";
  return `<span class="pill pill-${tone}">${escapeHtml(status)}</span>`;
}

function summary(targetState = state) {
  return {
    people: targetState.people.length,
    capacities: targetState.capacities.length,
    assignments: targetState.assignments.filter((assignment) => assignment.status === "Active").length,
    repositories: targetState.repositories.length,
    workers: targetState.workers.length,
    auditEntries: targetState.audit.length,
  };
}

function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;

  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
}

async function sha256(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function contentHash(value) {
  return sha256(stableStringify(value ?? null));
}

async function buildAuditEntry(audit, actor, event) {
  const previousHash = audit.length ? audit[audit.length - 1].hash : "GENESIS";
  const beforeHash = await contentHash(event.before);
  const afterHash = await contentHash(event.after);
  const unsigned = {
    index: audit.length + 1,
    timestamp: new Date().toISOString(),
    actor: String(actor || "").trim() || "Unknown",
    action: event.action,
    entityType: event.entityType,
    entityId: event.entityId,
    summary: event.summary,
    beforeHash,
    afterHash,
    previousHash,
    payload: {
      before: event.before ?? null,
      after: event.after ?? null,
    },
  };
  return { ...unsigned, hash: await sha256(stableStringify(unsigned)) };
}

async function verifyAuditChain(entries) {
  const errors = [];

  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    const expectedIndex = index + 1;
    const expectedPreviousHash = index === 0 ? "GENESIS" : entries[index - 1].hash;

    if (entry.index !== expectedIndex) errors.push(`Entry ${expectedIndex}: expected index ${expectedIndex}, found ${entry.index}.`);
    if (entry.previousHash !== expectedPreviousHash) errors.push(`Entry ${expectedIndex}: previous hash does not point to the prior entry.`);
    if (entry.beforeHash !== await contentHash(entry.payload?.before ?? null)) errors.push(`Entry ${expectedIndex}: before payload hash mismatch.`);
    if (entry.afterHash !== await contentHash(entry.payload?.after ?? null)) errors.push(`Entry ${expectedIndex}: after payload hash mismatch.`);

    const { hash, ...unsigned } = entry;
    if (hash !== await sha256(stableStringify(unsigned))) errors.push(`Entry ${expectedIndex}: entry hash mismatch.`);
  }

  return { valid: errors.length === 0, checked: entries.length, errors };
}

async function commitState(next, event, auditBase = state.audit) {
  const entry = await buildAuditEntry(auditBase, next.actor || state.actor, event);
  state = {
    ...next,
    audit: [...auditBase, entry],
    lastSavedAt: new Date().toISOString(),
  };
  verifyResult = null;
  notice = { tone: "success", text: event.summary };
  saveState();
  render();
}

function findWorkerForPerson(person) {
  return state.workers.find((worker) => worker.id === person.workerKey) ||
    state.workers.find((worker) => worker.email && worker.email.toLowerCase() === String(person.email || "").toLowerCase()) ||
    state.workers.find((worker) => normalizeName(worker.fullName) === normalizeName(person.fullName));
}

function workerDetail(person, field) {
  const worker = findWorkerForPerson(person);
  return person?.[field] || worker?.[field] || "";
}

function matchStatus(person) {
  if (!state.workers.length) return "Pending";
  const worker = findWorkerForPerson(person);
  if (!worker) return "Review";
  return normalizeName(worker.fullName) === normalizeName(person.fullName) ? "Matched" : "Review";
}

function getCapacityMap() {
  return new Map(state.capacities.map((capacity) => [capacity.id, capacity]));
}

function getPersonMap() {
  return new Map(state.people.map((person) => [person.id, person]));
}

function personIdsForCapacity(capacityId) {
  const activePersonIds = new Set(state.people
    .filter((person) => person.status === "Active")
    .map((person) => person.id));
  return new Set(state.assignments.filter((assignment) =>
    assignment.capacityId === capacityId &&
    assignment.status === "Active" &&
    activePersonIds.has(assignment.personId)
  ).map((assignment) => assignment.personId));
}

function peopleCountForCapacity(capacityId) {
  return personIdsForCapacity(capacityId).size;
}

function peopleForActiveSkillFilter() {
  if (!peopleSkillFilterId) return state.people;
  const personIds = personIdsForCapacity(peopleSkillFilterId);
  return state.people.filter((person) => personIds.has(person.id));
}

function hasSelectedVisiblePerson() {
  return Boolean(selectedPersonId && peopleForActiveSkillFilter().some((person) => person.id === selectedPersonId));
}

function hasSelectedSkill() {
  return Boolean(selectedCapacityId && state.capacities.some((skill) => skill.id === selectedCapacityId));
}

function selectedRepository() {
  return selectedRepositoryId ? state.repositories.find((repository) => repository.id === selectedRepositoryId) : null;
}

function canChangeRepository(repository) {
  return Boolean(repository && asIngestionStatus(repository.ingestionStatus || repository.status) === "submitted");
}

function contributorNameForRepository(repository) {
  const person = state.people.find((candidate) => candidate.id === repository.ownerPersonId);
  return person?.fullName || repository.stewardName || "";
}

function contributorSearchValueForRepository(repository) {
  const person = state.people.find((candidate) => candidate.id === repository.ownerPersonId);
  const worker = person ? findWorkerForPerson(person) : workerFromSearchValue(repository.stewardName);
  return worker ? workerLabel(worker) : repository.stewardName || "";
}

function asIngestionStatus(value) {
  const normalized = String(value || "").toLowerCase().trim();
  if (normalized === "y" || normalized === "yes" || normalized === "connected" || normalized.startsWith("y ")) return "y";
  if (normalized === "ip" || normalized === "in progress" || normalized === "needs access" || normalized.startsWith("ip ")) return "ip";
  if (normalized === "submitted" || normalized === "submitted - not ingested" || normalized.includes("not ingested")) return "submitted";
  return "no";
}

function ingestionStatusLabel(value, date = "") {
  const normalized = asIngestionStatus(value);
  if (normalized === "y") return date ? `Y (${date})` : "Y";
  if (normalized === "ip") return "IP";
  if (normalized === "submitted") return "submitted - not ingested";
  return "No";
}

function ingestionDateFromStatusDisplay(value) {
  const match = String(value || "").match(/\(([^)]+)\)/);
  return match ? match[1].trim() : "";
}

function ingestionStatusPill(repository) {
  const status = ingestionStatusLabel(repository.ingestionStatus || repository.status, repository.date);
  const normalized = asIngestionStatus(repository.ingestionStatus || repository.status);
  const tone = normalized === "y" ? "good" : normalized === "ip" || normalized === "submitted" ? "neutral" : "warn";
  return `<span class="pill pill-${tone}">${escapeHtml(status)}</span>`;
}

function repositoryLinkHtml(url) {
  if (!url) return "";
  return `<a class="url-cell" href="${escapeHtml(url)}" target="_blank" rel="noreferrer">${escapeHtml(url)}</a>`;
}

function repositoryStatusFromIngestion(value) {
  const normalized = asIngestionStatus(value);
  if (normalized === "y") return "Connected";
  if (normalized === "ip") return "Needs Access";
  return "Candidate";
}

function formValue(form, name) {
  return String(new FormData(form).get(name) || "").trim();
}

function readCell(row, candidates) {
  const keys = Object.keys(row || {});
  const lookup = new Map(keys.map((key) => [normalizeHeader(key), key]));

  for (const candidate of candidates) {
    const key = lookup.get(normalizeHeader(candidate));
    if (key) return String(row[key] ?? "").trim();
  }

  return "";
}

function requireXlsx() {
  if (!window.XLSX) throw new Error("The Excel library did not load.");
  return window.XLSX;
}

async function readWorkbook(file) {
  const XLSX = requireXlsx();
  if (file.name.toLowerCase().endsWith(".csv")) {
    return XLSX.read(await file.text(), { type: "string", cellDates: true });
  }
  return XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
}

function sheetRows(workbook, sheetName) {
  const actualName = workbook.SheetNames.find((candidate) => normalizeHeader(candidate) === normalizeHeader(sheetName));
  if (!actualName) return [];
  return requireXlsx().utils.sheet_to_json(workbook.Sheets[actualName], { defval: "", raw: false });
}

function metadataValue(rows, key) {
  const row = rows.find((candidate) => normalizeHeader(readCell(candidate, ["Key"])) === normalizeHeader(key));
  return row ? readCell(row, ["Value"]) : "";
}

function rowToWorker(row, source, importedAt) {
  const firstName = readCell(row, ["First Name", "Preferred First Name", "Given Name"]);
  const lastName = readCell(row, ["Last Name", "Surname", "Family Name"]);
  const fullName = readCell(row, ["Full Name", "Worker", "Worker Name", "Employee Name", "Name", "Preferred Name", "Legal Name"]) ||
    `${firstName} ${lastName}`.trim();
  const email = readCell(row, ["Email", "Email Address", "Work Email", "Primary Email"]);
  const workerId = readCell(row, ["Worker ID", "Employee ID", "WorkerId", "Employee Number", "Personnel Number"]);
  if (!fullName && !email && !workerId) return null;

  return {
    id: workerKey(fullName, email, workerId),
    workerId,
    fullName,
    email,
    title: readCell(row, ["Business Title", "Title", "Job Title", "Position", "Role", "Job Profile"]),
    practice: readCell(row, ["Practice", "Department", "Business Unit", "Team", "Capability"]),
    discipline: readCell(row, ["Discipline", "Sub Practice", "Capability Discipline"]),
    location: readCell(row, ["Location", "Office", "Work Location"]),
    level: readCell(row, ["Job Level", "Management Level", "Level"]),
    status: readCell(row, ["Status", "Worker Status", "Employee Status", "Active Status"]) || "Active",
    source,
    importedAt,
  };
}

function workerDirectoryRows(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.workers)) return payload.workers;
  if (Array.isArray(payload?.people)) return payload.people;
  return [];
}

function workerFromDirectoryRecord(row, source, importedAt) {
  const worker = rowToWorker(row, source, importedAt);
  if (worker) return worker;

  const fullName = readCell(row, ["Full Name", "Name", "Person Name"]);
  const email = readCell(row, ["Email", "Email Address"]);
  const workerId = readCell(row, ["Worker ID", "Person ID", "ID"]);
  if (!fullName && !email && !workerId) return null;

  return {
    id: readCell(row, ["Worker Key"]) || workerKey(fullName, email, workerId),
    workerId,
    fullName,
    email,
    title: readCell(row, ["Title"]),
    practice: readCell(row, ["Practice"]),
    discipline: readCell(row, ["Discipline"]),
    location: readCell(row, ["Location"]),
    level: readCell(row, ["Level"]),
    status: readCell(row, ["Status"]) || "Active",
    source,
    importedAt,
  };
}

function normalizeWorkerDirectoryRows(rows, source, importedAt) {
  const workers = new Map();
  for (const row of rows) {
    const worker = workerFromDirectoryRecord(row, source, importedAt);
    if (worker) workers.set(worker.id, worker);
  }
  return Array.from(workers.values()).sort((a, b) => String(a.fullName).localeCompare(String(b.fullName)));
}

async function parseWorkerFile(file, sourceOverride = "") {
  const importedAt = new Date().toISOString();
  const source = sourceOverride || file.name;

  if (file.name.toLowerCase().endsWith(".json")) {
    const payload = JSON.parse(await file.text());
    return normalizeWorkerDirectoryRows(workerDirectoryRows(payload), source, importedAt);
  }

  const workbook = await readWorkbook(file);
  const workers = new Map();

  for (const sheetName of workbook.SheetNames) {
    const rows = requireXlsx().utils.sheet_to_json(workbook.Sheets[sheetName], { defval: "", raw: false });
    for (const row of rows) {
      const worker = rowToWorker(row, source, importedAt);
      if (worker) workers.set(worker.id, worker);
    }
  }

  return Array.from(workers.values()).sort((a, b) => String(a.fullName).localeCompare(String(b.fullName)));
}

function asRecordStatus(value) {
  return String(value || "").toLowerCase() === "inactive" ? "Inactive" : "Active";
}

function asRepositoryType(value) {
  const allowed = ["GitHub", "SharePoint / Teams", "Confluence", "Document Library", "Network Folder", "Other"];
  return allowed.find((item) => item.toLowerCase() === String(value || "").toLowerCase()) || "Other";
}

function asRepositoryStatus(value) {
  const allowed = ["Candidate", "Connected", "Needs Access", "Retired"];
  return allowed.find((item) => item.toLowerCase() === String(value || "").toLowerCase()) || "Candidate";
}

function safeJson(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

async function parsePortalWorkbook(file) {
  const workbook = await readWorkbook(file);
  const portalSheetNames = ["Metadata", "People", "Capacities", "PersonCapacities", "Repositories", "Workers", "AuditLog"];
  const hasPortalSheet = workbook.SheetNames.some((sheetName) => portalSheetNames.map(normalizeHeader).includes(normalizeHeader(sheetName)));
  if (!hasPortalSheet) throw new Error("The selected file does not look like a portal workbook.");

  const initial = createInitialState();
  const metadata = sheetRows(workbook, "Metadata");
  const now = new Date().toISOString();
  const capacities = sheetRows(workbook, "Capacities").map((row) => ({
    id: readCell(row, ["Capacity ID", "ID", "Id"]) || createId("capacity"),
    name: readCell(row, ["Name", "Capacity", "Capacity Name"]),
    description: readCell(row, ["Description", "Notes"]),
    status: asRecordStatus(readCell(row, ["Status"])),
    createdAt: readCell(row, ["Created At", "CreatedAt"]) || now,
    updatedAt: readCell(row, ["Updated At", "UpdatedAt"]) || now,
  })).filter((capacity) => capacity.name);

  return {
    ...initial,
    people: sheetRows(workbook, "People").map((row) => ({
      id: readCell(row, ["Person ID", "ID", "Id"]) || createId("person"),
      workerKey: readCell(row, ["Worker Key", "WorkerKey", "Worker ID", "Employee ID"]),
      fullName: readCell(row, ["Full Name", "Name", "Person Name"]),
      email: readCell(row, ["Email", "Email Address", "Work Email"]),
      title: readCell(row, ["Title", "Job Title", "Role"]),
      practice: readCell(row, ["Practice", "Department", "Team"]),
      discipline: readCell(row, ["Discipline"]),
      location: readCell(row, ["Location"]),
      level: readCell(row, ["Level", "Job Level", "Management Level"]),
      status: asRecordStatus(readCell(row, ["Status"])),
      notes: readCell(row, ["Notes", "Comments"]),
      createdAt: readCell(row, ["Created At", "CreatedAt"]) || now,
      updatedAt: readCell(row, ["Updated At", "UpdatedAt"]) || now,
    })).filter((person) => person.fullName || person.email),
    capacities: capacities.length ? capacities : initial.capacities,
    assignments: sheetRows(workbook, "PersonCapacities").map((row) => ({
      id: readCell(row, ["Assignment ID", "ID", "Id"]) || createId("assignment"),
      personId: readCell(row, ["Person ID", "PersonId"]),
      capacityId: readCell(row, ["Capacity ID", "CapacityId"]),
      status: asRecordStatus(readCell(row, ["Status"])),
      startDate: readCell(row, ["Start Date", "StartDate"]),
      endDate: readCell(row, ["End Date", "EndDate"]),
      notes: readCell(row, ["Notes", "Comments"]),
      createdAt: readCell(row, ["Created At", "CreatedAt"]) || now,
      updatedAt: readCell(row, ["Updated At", "UpdatedAt"]) || now,
    })).filter((assignment) => assignment.personId && assignment.capacityId),
    repositories: sheetRows(workbook, "Repositories").map((row) => ({
      id: readCell(row, ["Repository ID", "ID", "Id"]) || createId("repo"),
      name: readCell(row, ["Name", "Repository", "Repository Name"]),
      type: asRepositoryType(readCell(row, ["Type", "Repository Type"])),
      url: readCell(row, ["URL", "Url", "Link"]),
      ownerPersonId: readCell(row, ["Owner Person ID", "OwnerPersonId", "Owner"]),
      date: readCell(row, ["Date", "Source Date", "File Date"]) ||
        ingestionDateFromStatusDisplay(readCell(row, ["Initial Model Ingestion Status", "Ingestion Status", "Model Ingestion", "Status"])),
      stewardName: readCell(row, ["Contributor", "Contributor Name", "Steward Name", "Steward", "Owner Name"]),
      ingestionStatus: asIngestionStatus(readCell(row, ["Initial Model Ingestion Status", "Ingestion Status", "Model Ingestion", "Status"])),
      status: asRepositoryStatus(readCell(row, ["Status"])),
      sensitivity: readCell(row, ["Sensitivity", "Classification"]),
      tags: readCell(row, ["Tags", "Keywords"]),
      notes: readCell(row, ["Desc", "Description", "Notes", "Comments"]),
      createdAt: readCell(row, ["Created At", "CreatedAt"]) || now,
      updatedAt: readCell(row, ["Updated At", "UpdatedAt"]) || now,
    })).filter((repository) => repository.name || repository.url),
    workers: sheetRows(workbook, "Workers").map((row) =>
      rowToWorker(row, readCell(row, ["Source"]) || file.name, readCell(row, ["Imported At"]) || now)
    ).filter(Boolean),
    audit: sheetRows(workbook, "AuditLog").map((row) => {
      const index = Number(readCell(row, ["Index"]));
      if (!Number.isFinite(index)) return null;
      return {
        index,
        timestamp: readCell(row, ["Timestamp"]),
        actor: readCell(row, ["Actor"]),
        action: readCell(row, ["Action"]) || "update",
        entityType: readCell(row, ["Entity Type", "EntityType"]) || "audit",
        entityId: readCell(row, ["Entity ID", "EntityId"]),
        summary: readCell(row, ["Summary"]),
        beforeHash: readCell(row, ["Before Hash", "BeforeHash"]),
        afterHash: readCell(row, ["After Hash", "AfterHash"]),
        previousHash: readCell(row, ["Previous Hash", "PreviousHash"]),
        hash: readCell(row, ["Hash"]),
        payload: safeJson(readCell(row, ["Payload JSON", "Payload", "PayloadJson"]), { before: null, after: null }),
      };
    }).filter(Boolean),
    actor: state.actor,
    workbookName: metadataValue(metadata, "Workbook Name") || file.name,
    workerSource: metadataValue(metadata, "Worker Source"),
    workerSourceMode: metadataValue(metadata, "Worker Source Mode"),
    workerImportedAt: metadataValue(metadata, "Worker Imported At"),
    workerSourceUpdatedAt: metadataValue(metadata, "Worker Source Updated At"),
    lastSavedAt: metadataValue(metadata, "Exported At") || now,
  };
}

function makeSheet(rows, headers, widths) {
  const XLSX = requireXlsx();
  const sheet = XLSX.utils.json_to_sheet(rows, { header: headers });
  if (!rows.length) XLSX.utils.sheet_add_aoa(sheet, [headers], { origin: "A1" });
  sheet["!cols"] = widths.map((wch) => ({ wch }));
  return sheet;
}

function exportPortalWorkbook() {
  const XLSX = requireXlsx();
  const workbook = XLSX.utils.book_new();
  const exportedAt = new Date().toISOString();
  const activeSkills = state.capacities.filter((capacity) => capacity.status === "Active");
  const skillHeaders = activeSkills.map((skill) => skill.name);
  const peopleHeaders = [
    "Person ID",
    "Worker Key",
    "Name",
    "Title",
    ...skillHeaders,
    "Practice",
    "Discipline",
    "Location",
    "Level",
    "Comments",
    "Status",
    "Email",
    "Created At",
    "Updated At",
  ];
  const peopleWidths = [24, 34, 26, 28, ...skillHeaders.map(() => 12), 22, 22, 24, 18, 36, 14, 32, 24, 24];

  XLSX.utils.book_append_sheet(workbook, makeSheet([
    { Key: "Workbook Version", Value: "0.1.0" },
    { Key: "Exported At", Value: exportedAt },
    { Key: "Workbook Name", Value: state.workbookName },
    { Key: "Worker Source", Value: state.workerSource },
    { Key: "Worker Source Mode", Value: state.workerSourceMode },
    { Key: "Worker Imported At", Value: state.workerImportedAt },
    { Key: "Worker Source Updated At", Value: state.workerSourceUpdatedAt },
  ], ["Key", "Value"], [24, 60]), "Metadata");

  XLSX.utils.book_append_sheet(workbook, makeSheet(state.people.map((person) => {
    const activeAssignmentIds = new Set(state.assignments
      .filter((assignment) => assignment.personId === person.id && assignment.status === "Active")
      .map((assignment) => assignment.capacityId));
    const skillValues = Object.fromEntries(activeSkills.map((skill) => [skill.name, activeAssignmentIds.has(skill.id) ? "Y" : ""]));

    return {
      "Person ID": person.id,
      "Worker Key": person.workerKey,
      Name: workerDetail(person, "fullName"),
      Title: workerDetail(person, "title"),
      ...skillValues,
      Practice: workerDetail(person, "practice"),
      Discipline: workerDetail(person, "discipline"),
      Location: workerDetail(person, "location"),
      Level: workerDetail(person, "level"),
      Comments: person.notes,
      Status: person.status,
      Email: person.email,
      "Created At": person.createdAt,
      "Updated At": person.updatedAt,
    };
  }), peopleHeaders, peopleWidths), "People");

  XLSX.utils.book_append_sheet(workbook, makeSheet(state.capacities.map((capacity) => ({
    "Capacity ID": capacity.id,
    Name: capacity.name,
    Description: capacity.description,
    Status: capacity.status,
    "Created At": capacity.createdAt,
    "Updated At": capacity.updatedAt,
  })), ["Capacity ID", "Name", "Description", "Status", "Created At", "Updated At"], [24, 18, 48, 14, 24, 24]), "Capacities");

  XLSX.utils.book_append_sheet(workbook, makeSheet(state.assignments.map((assignment) => ({
    "Assignment ID": assignment.id,
    "Person ID": assignment.personId,
    "Capacity ID": assignment.capacityId,
    Status: assignment.status,
    "Start Date": assignment.startDate,
    "End Date": assignment.endDate,
    Notes: assignment.notes,
    "Created At": assignment.createdAt,
    "Updated At": assignment.updatedAt,
  })), ["Assignment ID", "Person ID", "Capacity ID", "Status", "Start Date", "End Date", "Notes", "Created At", "Updated At"], [24, 24, 24, 14, 16, 16, 36, 24, 24]), "PersonCapacities");

  XLSX.utils.book_append_sheet(workbook, makeSheet(state.repositories.map((repository) => ({
    "Repository ID": repository.id,
    Name: repository.name,
    Desc: repository.notes,
    Link: repository.url,
    Contributor: contributorNameForRepository(repository),
    "Initial Model Ingestion Status": ingestionStatusLabel(repository.ingestionStatus || repository.status, repository.date),
    "Created At": repository.createdAt,
    "Updated At": repository.updatedAt,
  })), ["Repository ID", "Name", "Desc", "Link", "Contributor", "Initial Model Ingestion Status", "Created At", "Updated At"], [24, 28, 42, 54, 28, 34, 24, 24]), "Repositories");

  XLSX.utils.book_append_sheet(workbook, makeSheet(state.workers.map((worker) => ({
    "Worker Key": worker.id,
    "Worker ID": worker.workerId,
    "Full Name": worker.fullName,
    Email: worker.email,
    Title: worker.title,
    Practice: worker.practice,
    Discipline: worker.discipline,
    Location: worker.location,
    Level: worker.level,
    Status: worker.status,
    Source: worker.source,
    "Imported At": worker.importedAt,
  })), ["Worker Key", "Worker ID", "Full Name", "Email", "Title", "Practice", "Discipline", "Location", "Level", "Status", "Source", "Imported At"], [34, 18, 26, 32, 24, 22, 22, 24, 18, 16, 36, 24]), "Workers");

  XLSX.utils.book_append_sheet(workbook, makeSheet(state.audit.map((entry) => ({
    Index: entry.index,
    Timestamp: entry.timestamp,
    Actor: entry.actor,
    Action: entry.action,
    "Entity Type": entry.entityType,
    "Entity ID": entry.entityId,
    Summary: entry.summary,
    "Before Hash": entry.beforeHash,
    "After Hash": entry.afterHash,
    "Previous Hash": entry.previousHash,
    Hash: entry.hash,
    "Payload JSON": JSON.stringify(entry.payload),
  })), ["Index", "Timestamp", "Actor", "Action", "Entity Type", "Entity ID", "Summary", "Before Hash", "After Hash", "Previous Hash", "Hash", "Payload JSON"], [10, 24, 22, 14, 18, 28, 40, 18, 18, 18, 18, 72]), "AuditLog");

  const filename = String(state.workbookName || "diligence-ai-launch-portal.xlsx").endsWith(".xlsx")
    ? state.workbookName
    : `${state.workbookName}.xlsx`;
  XLSX.writeFile(workbook, filename);
}

function downloadTextFile(filename, text, type = "application/jsonl") {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function auditToJsonl() {
  return state.audit.map((entry) => JSON.stringify(entry)).join("\n");
}

async function parseAuditJsonl(file) {
  return (await file.text())
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

async function savePerson(form) {
  const now = new Date().toISOString();
  const existing = state.people.find((person) => person.id === editPersonId);
  const manualEntry = Boolean(new FormData(form).get("manualEntry"));
  const worker = manualEntry ? null : workerFromSearchValue(formValue(form, "workerSearch"));
  const fullName = manualEntry ? formValue(form, "fullName") : worker?.fullName || "";

  if (!manualEntry && !worker) {
    notice = { tone: "danger", text: "Select a person from search, or choose manual entry." };
    render();
    return;
  }

  if (manualEntry && !fullName) {
    notice = { tone: "danger", text: "Enter a person name." };
    render();
    return;
  }

  const nextPerson = {
    id: existing?.id || createId("person"),
    workerKey: manualEntry ? (existing?.workerKey || workerKey(fullName, existing?.email, "")) : worker.id,
    fullName,
    email: manualEntry ? (existing?.email || "") : worker.email,
    title: manualEntry ? formValue(form, "title") : worker.title,
    practice: manualEntry ? formValue(form, "practice") : worker.practice,
    discipline: manualEntry ? formValue(form, "discipline") : worker.discipline || "",
    location: manualEntry ? formValue(form, "location") : worker.location || "",
    level: manualEntry ? formValue(form, "level") : worker.level || "",
    status: existing?.status || "Active",
    notes: formValue(form, "notes"),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };

  const people = existing
    ? state.people.map((person) => person.id === existing.id ? nextPerson : person)
    : [...state.people, nextPerson];
  const selectedSkillIds = new Set(Array.from(form.querySelectorAll("[data-skill-checkbox]:checked")).map((input) => input.value));
  const beforeAssignments = existing
    ? state.assignments.filter((assignment) => assignment.personId === nextPerson.id)
    : [];
  const existingBySkill = new Map(beforeAssignments.map((assignment) => [assignment.capacityId, assignment]));
  const activeSkills = state.capacities.filter((capacity) => capacity.status === "Active");
  const nextPersonAssignments = [];

  for (const skill of activeSkills) {
    const existingAssignment = existingBySkill.get(skill.id);

    if (selectedSkillIds.has(skill.id)) {
      nextPersonAssignments.push({
        id: existingAssignment?.id || createId("assignment"),
        personId: nextPerson.id,
        capacityId: skill.id,
        status: "Active",
        startDate: existingAssignment?.startDate || today(),
        endDate: "",
        notes: existingAssignment?.notes || "",
        createdAt: existingAssignment?.createdAt || now,
        updatedAt: now,
      });
    } else if (existingAssignment) {
      nextPersonAssignments.push({
        ...existingAssignment,
        status: "Inactive",
        endDate: existingAssignment.endDate || today(),
        updatedAt: now,
      });
    }
  }
  const assignments = [
    ...state.assignments.filter((assignment) => assignment.personId !== nextPerson.id),
    ...nextPersonAssignments,
  ];

  editPersonId = "";
  selectedPersonId = nextPerson.id;
  await commitState({ ...state, people, assignments }, {
    action: existing ? "update" : "create",
    entityType: "person",
    entityId: nextPerson.id,
    summary: `${existing ? "Updated" : "Added"} ${nextPerson.fullName}.`,
    before: { person: existing || null, assignments: beforeAssignments },
    after: { person: nextPerson, assignments: nextPersonAssignments },
  });
}

async function deletePerson() {
  const existing = state.people.find((person) => person.id === editPersonId);
  if (!existing) return;

  const beforeAssignments = state.assignments.filter((assignment) => assignment.personId === existing.id);
  const people = state.people.filter((person) => person.id !== existing.id);
  const assignments = state.assignments.filter((assignment) => assignment.personId !== existing.id);

  editPersonId = "";
  selectedPersonId = "";
  await commitState({ ...state, people, assignments }, {
    action: "delete",
    entityType: "person",
    entityId: existing.id,
    summary: `Deleted ${existing.fullName}.`,
    before: { person: existing, assignments: beforeAssignments },
    after: null,
  });
}

async function saveCapacity(form) {
  const now = new Date().toISOString();
  const existing = state.capacities.find((capacity) => capacity.id === editCapacityId);
  const name = formValue(form, "name");

  if (!name) {
    notice = { tone: "danger", text: "Skill name is required." };
    render();
    return;
  }

  const nextCapacity = {
    id: existing?.id || createId("capacity"),
    name,
    description: formValue(form, "description"),
    status: existing?.status || "Active",
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };

  const capacities = existing
    ? state.capacities.map((capacity) => capacity.id === existing.id ? nextCapacity : capacity)
    : [...state.capacities, nextCapacity];

  editCapacityId = "";
  selectedCapacityId = nextCapacity.id;
  await commitState({ ...state, capacities }, {
    action: existing ? "update" : "create",
    entityType: "capacity",
    entityId: nextCapacity.id,
    summary: `${existing ? "Updated" : "Added"} skill ${nextCapacity.name}.`,
    before: existing || null,
    after: nextCapacity,
  });
}

async function deleteCapacity() {
  const existing = state.capacities.find((capacity) => capacity.id === editCapacityId);
  if (!existing) return;

  const beforeAssignments = state.assignments.filter((assignment) => assignment.capacityId === existing.id);
  const capacities = state.capacities.filter((capacity) => capacity.id !== existing.id);
  const assignments = state.assignments.filter((assignment) => assignment.capacityId !== existing.id);

  editCapacityId = "";
  selectedCapacityId = "";
  if (peopleSkillFilterId === existing.id) peopleSkillFilterId = "";
  await commitState({ ...state, capacities, assignments }, {
    action: "delete",
    entityType: "capacity",
    entityId: existing.id,
    summary: `Deleted skill ${existing.name}.`,
    before: { capacity: existing, assignments: beforeAssignments },
    after: null,
  });
}

async function saveAssignments() {
  if (!assignmentPersonId) {
    notice = { tone: "danger", text: "Select a person for skill assignment." };
    render();
    return;
  }

  const selected = new Set(Array.from(document.querySelectorAll("[data-capacity-checkbox]:checked")).map((input) => input.value));
  const startDate = document.getElementById("assignmentStartDate")?.value || today();
  const notes = document.getElementById("assignmentNotes")?.value.trim() || "";
  const now = new Date().toISOString();
  const activeCapacities = state.capacities.filter((capacity) => capacity.status === "Active");
  const before = state.assignments.filter((assignment) => assignment.personId === assignmentPersonId);
  const existingByCapacity = new Map(before.map((assignment) => [assignment.capacityId, assignment]));
  const retained = state.assignments.filter((assignment) => assignment.personId !== assignmentPersonId);
  const nextAssignments = [];

  for (const capacity of activeCapacities) {
    const existing = existingByCapacity.get(capacity.id);
    if (selected.has(capacity.id)) {
      nextAssignments.push({
        id: existing?.id || createId("assignment"),
        personId: assignmentPersonId,
        capacityId: capacity.id,
        status: "Active",
        startDate: existing?.startDate || startDate,
        endDate: "",
        notes: notes || existing?.notes || "",
        createdAt: existing?.createdAt || now,
        updatedAt: now,
      });
    } else if (existing) {
      nextAssignments.push({
        ...existing,
        status: "Inactive",
        endDate: existing.endDate || today(),
        updatedAt: now,
      });
    }
  }

  const person = state.people.find((candidate) => candidate.id === assignmentPersonId);
  await commitState({ ...state, assignments: [...retained, ...nextAssignments] }, {
    action: "update",
    entityType: "assignment",
    entityId: assignmentPersonId,
    summary: `Updated skill assignments for ${person?.fullName || "person"}.`,
    before,
    after: nextAssignments,
  });
}

async function saveRepository(form) {
  const now = new Date().toISOString();
  const existing = state.repositories.find((repository) => repository.id === editRepositoryId);
  const name = formValue(form, "name");
  const url = formValue(form, "url");
  const ingestionStatus = existing ? asIngestionStatus(existing.ingestionStatus || existing.status) : "submitted";
  const contributorWorker = workerFromSearchValue(formValue(form, "contributorSearch"));

  if (!name && !url) {
    notice = { tone: "danger", text: "Data source name or URL is required." };
    render();
    return;
  }

  if (!contributorWorker) {
    notice = { tone: "danger", text: "Select a contributor from the active worker search." };
    render();
    return;
  }

  const existingContributor = findPersonForWorker(contributorWorker);
  const contributorPerson = existingContributor || {
    id: createId("person"),
    workerKey: contributorWorker.id,
    fullName: contributorWorker.fullName,
    email: contributorWorker.email,
    title: contributorWorker.title,
    practice: contributorWorker.practice,
    discipline: contributorWorker.discipline || "",
    location: contributorWorker.location || "",
    level: contributorWorker.level || "",
    status: "Active",
    notes: `Added via data submission transaction: ${name || url}.`,
    createdAt: now,
    updatedAt: now,
  };
  const people = existingContributor
    ? state.people
    : [...state.people, contributorPerson];

  const nextRepository = {
    id: existing?.id || createId("repo"),
    name: name || url,
    type: existing?.type || "Document Library",
    url,
    date: existing?.date || "",
    stewardName: contributorWorker.fullName,
    ownerPersonId: contributorPerson.id,
    ingestionStatus,
    status: repositoryStatusFromIngestion(ingestionStatus),
    sensitivity: existing?.sensitivity || "",
    tags: existing?.tags || "",
    notes: formValue(form, "description"),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };

  const repositories = existing
    ? state.repositories.map((repository) => repository.id === existing.id ? nextRepository : repository)
    : [...state.repositories, nextRepository];

  editRepositoryId = "";
  selectedRepositoryId = nextRepository.id;
  await commitState({ ...state, people, repositories }, {
    action: existing ? "update" : "create",
    entityType: "repository",
    entityId: nextRepository.id,
    summary: `${existing ? "Updated" : "Added"} data source ${nextRepository.name}.`,
    before: { repository: existing || null, contributor: existingContributor || null },
    after: { repository: nextRepository, contributor: contributorPerson, contributorAdded: !existingContributor },
  });
}

async function importWorkerFile(file) {
  try {
    const source = file.name || state.workerSource || "Active Worker Census";
    const workers = await parseWorkerFile(file, source);
    if (!workers.length) {
      notice = { tone: "danger", text: "No worker records were found in that file." };
      render();
      return;
    }

    const importedAt = new Date().toISOString();
    await commitState({ ...state, workers, workerSource: source, workerSourceMode: "uploaded", workerImportedAt: importedAt, workerSourceUpdatedAt: importedAt }, {
      action: "import",
      entityType: "workerDirectory",
      entityId: source,
      summary: `Imported ${workers.length} worker records.`,
      before: { workers: state.workers.length, source: state.workerSource },
      after: { workers: workers.length, source },
    });
  } catch (error) {
    notice = { tone: "danger", text: error.message || "Worker import failed." };
    render();
  }
}

async function importPortalWorkbook(file) {
  try {
    const imported = await parsePortalWorkbook(file);
    const next = { ...imported, actor: state.actor || imported.actor, workbookName: imported.workbookName || file.name };
    const entry = await buildAuditEntry(next.audit, next.actor, {
      action: "import",
      entityType: "workbook",
      entityId: file.name,
      summary: `Imported portal workbook ${file.name}.`,
      before: summary(state),
      after: summary(next),
    });

    state = {
      ...next,
      audit: [...next.audit, entry],
      lastSavedAt: new Date().toISOString(),
    };
    verifyResult = null;
    notice = { tone: "success", text: `Imported portal workbook ${file.name}.` };
    saveState();
    render();
  } catch (error) {
    notice = { tone: "danger", text: error.message || "Workbook import failed." };
    render();
  }
}

async function importAuditFile(file) {
  try {
    const audit = await parseAuditJsonl(file);
    verifyResult = await verifyAuditChain(audit);
    state = { ...state, audit, lastSavedAt: new Date().toISOString() };
    notice = { tone: verifyResult.valid ? "success" : "warning", text: `Imported ${audit.length} audit entries.` };
    saveState();
    render();
  } catch (error) {
    notice = { tone: "danger", text: error.message || "Audit import failed." };
    render();
  }
}

function shouldLoadMaskedPeopleSeed(source, sourceUpdatedAt) {
  if (!state.workers.length) return true;
  if (state.workerSourceMode === "uploaded") return false;
  if (state.workerSource === source && state.workerSourceUpdatedAt === sourceUpdatedAt) return false;
  if (state.workerSourceMode === "masked") return false;
  return /active worker|workday|census|seed/i.test(state.workerSource || "");
}

async function loadMaskedPeopleSeed() {
  try {
    const response = await fetch(MASKED_PEOPLE_URL, { cache: "no-store" });
    if (!response.ok) return;

    const payload = await response.json();
    const source = payload.source || "Masked People Directory";
    const sourceUpdatedAt = payload.sourceUpdatedAt || payload.generatedAt || "";
    if (!shouldLoadMaskedPeopleSeed(source, sourceUpdatedAt)) return;

    const importedAt = new Date().toISOString();
    const workers = normalizeWorkerDirectoryRows(workerDirectoryRows(payload), source, importedAt);
    if (!workers.length) return;

    const next = {
      ...state,
      workers,
      workerSource: source,
      workerSourceMode: "masked",
      workerImportedAt: importedAt,
      workerSourceUpdatedAt: sourceUpdatedAt,
    };
    const entry = await buildAuditEntry(state.audit, state.actor, {
      action: "import",
      entityType: "workerDirectory",
      entityId: source,
      summary: `Imported ${workers.length} masked people records.`,
      before: { workers: state.workers.length, source: state.workerSource },
      after: { workers: workers.length, source, sourceUpdatedAt },
    });

    state = {
      ...next,
      audit: [...state.audit, entry],
      lastSavedAt: importedAt,
    };
    notice = { tone: "success", text: `Imported ${workers.length} masked people records.` };
    saveState();
    render();
  } catch {
    // The masked seed is a convenience for GitHub Pages; upload remains the fallback.
  }
}

function metricsHtml() {
  const metrics = summary();
  return `
    <section class="status-strip" aria-label="Portal status">
      <div class="metric">${icon("users")}<span>${metrics.people}</span><small>People</small></div>
      <div class="metric">${icon("user-cog")}<span>${metrics.assignments}</span><small>Skills</small></div>
      <div class="metric">${icon("link-2")}<span>${metrics.repositories}</span><small>Data</small></div>
      <div class="metric">${icon("database")}<span>${metrics.workers}</span><small>Workers</small></div>
      <div class="metric">${icon("shield-check")}<span>${metrics.auditEntries}</span><small>Audit</small></div>
      <div class="save-state"><span>Last saved</span><strong>${escapeHtml(formatDateTime(state.lastSavedAt))}</strong></div>
    </section>`;
}

function tabsHtml() {
  const primaryTabs = [
    ["people", "users", "People"],
    ["capacities", "user-cog", "Skill"],
    ["repositories", "database", "Data"],
  ];
  const adminTabs = [
    ["workers", "database", "Workers"],
    ["excelStorage", "file-spreadsheet", "Excel Storage"],
    ["auditChain", "shield-check", "Audit Chain"],
  ];

  const buttons = (tabs) => tabs.map(([id, iconName, label]) =>
    `<button class="${activeTab === id ? "active" : ""}" data-tab="${id}">${icon(iconName)}<span>${label}</span></button>`
  ).join("");

  return `
    <aside class="side-nav" aria-label="Portal sections">
      <div class="side-nav-section">
        <span class="side-nav-label">Portal</span>
        ${buttons(primaryTabs)}
      </div>
      <div class="side-nav-section">
        <span class="side-nav-label">Admin</span>
        ${buttons(adminTabs)}
      </div>
    </aside>`;
}

function noticeHtml() {
  if (!notice) return "";
  const iconName = notice.tone === "danger" ? "x-circle" : notice.tone === "warning" ? "alert-triangle" : "check-circle-2";
  return `
    <div class="notice notice-${notice.tone}" role="status">
      ${icon(iconName)}
      <span>${escapeHtml(notice.text)}</span>
      <button class="icon-button" id="dismissNotice" title="Dismiss">${icon("x-circle")}</button>
    </div>`;
}

function renderFormSelect(name, value, options, extraClass = "") {
  return `
    <select name="${name}" class="${extraClass}">
      ${options.map((option) => {
        const optionValue = typeof option === "string" ? option : option.value;
        const label = typeof option === "string" ? option : option.label;
        return `<option value="${escapeHtml(optionValue)}" ${value === optionValue ? "selected" : ""}>${escapeHtml(label)}</option>`;
      }).join("")}
    </select>`;
}

function activeSkillChecks(personId) {
  const activeSkills = state.capacities.filter((capacity) => capacity.status === "Active");
  const activeAssignmentIds = new Set(state.assignments
    .filter((assignment) => assignment.personId === personId && assignment.status === "Active")
    .map((assignment) => assignment.capacityId));

  if (!activeSkills.length) {
    return `<span class="muted">No active skills</span>`;
  }

  return activeSkills.map((skill) => `
    <label class="mini-check">
      <input type="checkbox" value="${escapeHtml(skill.id)}" data-skill-checkbox ${activeAssignmentIds.has(skill.id) ? "checked" : ""} />
      <span>${escapeHtml(skill.name)}</span>
    </label>
  `).join("");
}

function renderPeopleForm() {
  if (!editPersonId) return "";
  const isNew = editPersonId === "new";
  const person = isNew ? {} : state.people.find((candidate) => candidate.id === editPersonId) || {};
  const worker = findWorkerForPerson(person);
  const manualDefault = isNew ? !state.workers.length : !worker;
  const workerSearchValue = worker ? workerLabel(worker) : "";

  return `
    <form class="panel form-panel editor-panel person-entry-form" id="personForm">
      <div class="panel-heading">
        <h2>${isNew ? "Add Person" : "Change Person"}</h2>
        <button type="button" class="icon-button" id="cancelPersonForm" title="Cancel">${icon("x-circle")}</button>
      </div>
      <div class="form-note">${icon("info")}<span>People search uses masked people data. Select manual entry when the person is not listed.</span></div>
      <label class="check-row person-entry-toggle">
        <input type="checkbox" id="manualPersonEntry" name="manualEntry" ${manualDefault ? "checked" : ""} />
        <span>Enter person manually</span>
      </label>
      <div class="person-search-block">
        <label>Search people
          <input class="worker-search-input" name="workerSearch" list="activeWorkerOptions" value="${escapeHtml(workerSearchValue)}" placeholder="Search by name, email, or title" autocomplete="off" />
          <datalist id="activeWorkerOptions">
            ${state.workers.map((candidate) => `<option value="${escapeHtml(workerLabel(candidate))}"></option>`).join("")}
          </datalist>
        </label>
      </div>
      <div class="form-grid manual-person-fields">
        <label>Name<input name="fullName" value="${escapeHtml(person.fullName || "")}" /></label>
        <label>Title<input name="title" value="${escapeHtml(person.title || "")}" /></label>
        <label>Practice<input name="practice" value="${escapeHtml(person.practice || "")}" /></label>
        <label>Discipline<input name="discipline" value="${escapeHtml(person.discipline || "")}" /></label>
        <label>Location<input name="location" value="${escapeHtml(person.location || "")}" /></label>
        <label>Level<input name="level" value="${escapeHtml(person.level || "")}" /></label>
      </div>
      <label>Pick skill
        <div class="skill-cell form-skill-cell">${activeSkillChecks(isNew ? "" : person.id)}</div>
      </label>
      <label>Comments<textarea name="notes">${escapeHtml(person.notes || "")}</textarea></label>
      <div class="button-row">
        <button class="button button-primary" type="submit">${icon("save")}Save</button>
        ${isNew ? "" : `<button class="button button-danger" type="button" id="deletePersonRecord">${icon("trash-2")}Delete</button>`}
        <button class="button button-secondary" type="button" id="cancelPersonFormAlt">${icon("x-circle")}Cancel</button>
      </div>
    </form>`;
}

function renderPeople() {
  const activeSkills = state.capacities.filter((capacity) => capacity.status === "Active");
  const filteredSkill = peopleSkillFilterId ? state.capacities.find((skill) => skill.id === peopleSkillFilterId) : null;
  const people = peopleForActiveSkillFilter();
  const showPersonActions = hasSelectedVisiblePerson();
  const skillHeaders = activeSkills.map((skill) => `<th class="skill-heading">${escapeHtml(skill.name)}</th>`).join("");
  const rows = people.length ? people.map((person) => {
    const activeAssignmentIds = new Set(state.assignments
      .filter((assignment) => assignment.personId === person.id && assignment.status === "Active")
      .map((assignment) => assignment.capacityId));
    const skillCells = activeSkills.map((skill) => (
      `<td class="x-cell">${activeAssignmentIds.has(skill.id) ? "Y" : ""}</td>`
    )).join("");

    return `
      <tr class="${selectedPersonId === person.id ? "selected-row" : ""}">
        <td><input type="radio" name="selectedPerson" value="${escapeHtml(person.id)}" ${selectedPersonId === person.id ? "checked" : ""} /></td>
        <td><strong>${escapeHtml(workerDetail(person, "fullName"))}</strong></td>
        <td>${escapeHtml(workerDetail(person, "title"))}</td>
        ${skillCells}
        <td>${escapeHtml(workerDetail(person, "practice"))}</td>
        <td>${escapeHtml(workerDetail(person, "discipline"))}</td>
        <td>${escapeHtml(workerDetail(person, "location"))}</td>
        <td>${escapeHtml(workerDetail(person, "level"))}</td>
        <td>${escapeHtml(person.notes)}</td>
      </tr>
    `;
  }).join("") : `<tr><td colspan="${8 + activeSkills.length}" class="empty-cell">${filteredSkill ? `No people assigned to ${escapeHtml(filteredSkill.name)}.` : "No people added."}</td></tr>`;
  const filterControl = filteredSkill ? `
    <div class="filter-chip">
      ${icon("filter")}
      <span>Skill: ${escapeHtml(filteredSkill.name)}</span>
      <button class="icon-button" id="clearPeopleSkillFilter" title="Clear skill filter">${icon("x-circle")}</button>
    </div>` : "";

  return `
    <section class="worksheet-stack">
      <section class="panel table-panel roster-panel">
        <div class="panel-heading">
          <div>
            <h2>People Worksheet</h2>
            <span class="panel-subtitle">Browse the roster, select a row, then use Add or Change to open the controlled form.</span>
          </div>
          <div class="button-row">
            ${filterControl}
            <button class="button button-secondary" id="addPersonRecord">${icon("plus")}Add</button>
            ${showPersonActions ? `<button class="button button-primary" id="changePersonRecord">${icon("pencil")}Change</button>` : ""}
            ${showPersonActions ? `<button class="button button-danger" id="deleteSelectedPersonRecord">${icon("trash-2")}Delete</button>` : ""}
          </div>
        </div>
        <div class="table-wrap roster-wrap">
          <table class="roster-table people-roster">
            <thead><tr><th></th><th>Name</th><th>Title</th>${skillHeaders}<th>Practice</th><th>Discipline</th><th>Location</th><th>Level</th><th>Comments</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </section>
      ${renderPeopleForm()}
    </section>`;
}

function renderSkillForm() {
  if (!editCapacityId) return "";
  const isNew = editCapacityId === "new";
  const skill = isNew ? {} : state.capacities.find((candidate) => candidate.id === editCapacityId) || {};

  return `
    <form class="panel form-panel editor-panel" id="capacityForm">
      <div class="panel-heading">
        <h2>${isNew ? "Add Skill" : "Change Skill"}</h2>
        <button type="button" class="icon-button" id="cancelSkillForm" title="Cancel">${icon("x-circle")}</button>
      </div>
      <label>Skill<input name="name" value="${escapeHtml(skill.name || "")}" /></label>
      <label>Desc<textarea name="description">${escapeHtml(skill.description || "")}</textarea></label>
      <div class="button-row">
        <button class="button button-primary" type="submit">${icon("save")}Save</button>
        ${isNew ? "" : `<button class="button button-danger" type="button" id="deleteSkillRecord">${icon("trash-2")}Delete</button>`}
        <button class="button button-secondary" type="button" id="cancelSkillFormAlt">${icon("x-circle")}Cancel</button>
      </div>
    </form>`;
}

function renderCapacities() {
  const showSkillActions = hasSelectedSkill();
  const rows = state.capacities.length ? state.capacities.map((skill) => `
    <tr class="${selectedCapacityId === skill.id ? "selected-row" : ""}">
      <td><input type="radio" name="selectedSkill" value="${escapeHtml(skill.id)}" ${selectedCapacityId === skill.id ? "checked" : ""} /></td>
      <td><strong>${escapeHtml(skill.name)}</strong></td>
      <td class="skill-desc-cell">${escapeHtml(skill.description)}</td>
      <td class="people-count-cell">
        <button class="count-drill-button" data-filter-people-skill="${escapeHtml(skill.id)}" title="Show people assigned to ${escapeHtml(skill.name)}">${peopleCountForCapacity(skill.id)}</button>
      </td>
    </tr>
  `).join("") : `<tr><td colspan="4" class="empty-cell">No skills added.</td></tr>`;

  return `
    <section class="worksheet-stack">
      <section class="panel table-panel roster-panel">
        <div class="panel-heading">
          <div>
            <h2>Skill Worksheet</h2>
            <span class="panel-subtitle">Browse skills, select a row, then add or change through the audited form.</span>
          </div>
          <div class="button-row">
            <button class="button button-secondary" id="addSkillRecord">${icon("plus")}Add</button>
            ${showSkillActions ? `<button class="button button-primary" id="changeSkillRecord">${icon("pencil")}Change</button>` : ""}
            ${showSkillActions ? `<button class="button button-danger" id="deleteSelectedSkillRecord">${icon("trash-2")}Delete</button>` : ""}
          </div>
        </div>
        <div class="table-wrap roster-wrap">
          <table class="roster-table skills-roster">
            <thead><tr><th></th><th>Skill</th><th>Desc</th><th># People</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </section>
      ${renderSkillForm()}
    </section>`;
}

function renderFileForm() {
  if (!editRepositoryId) return "";
  const isNew = editRepositoryId === "new";
  const file = isNew ? {} : state.repositories.find((candidate) => candidate.id === editRepositoryId) || {};
  const ingestionStatus = isNew ? "submitted" : asIngestionStatus(file.ingestionStatus || file.status);

  return `
    <form class="panel form-panel editor-panel" id="repositoryForm">
      <div class="panel-heading">
        <h2>${isNew ? "Add Data Source" : "Change Data Source"}</h2>
        <button type="button" class="icon-button" id="cancelFileForm" title="Cancel">${icon("x-circle")}</button>
      </div>
      <div class="form-grid">
        <label>Name<input name="name" value="${escapeHtml(file.name || "")}" /></label>
        <label>Desc<input name="description" value="${escapeHtml(file.notes || "")}" /></label>
        <label>Link<input name="url" value="${escapeHtml(file.url || "")}" /></label>
        <label>Contributor
          <input class="worker-search-input" name="contributorSearch" list="activeWorkerOptions" value="${escapeHtml(contributorSearchValueForRepository(file))}" placeholder="Search by name or email" autocomplete="off" />
          <datalist id="activeWorkerOptions">
            ${state.workers.map((candidate) => `<option value="${escapeHtml(workerLabel(candidate))}"></option>`).join("")}
          </datalist>
        </label>
        <label>Initial model ingestion status
          <input name="ingestionStatusDisplay" value="${escapeHtml(ingestionStatusLabel(ingestionStatus, file.date))}" readonly />
        </label>
      </div>
      <div class="button-row">
        <button class="button button-primary" type="submit">${icon("save")}Save</button>
        <button class="button button-secondary" type="button" id="cancelFileFormAlt">${icon("x-circle")}Cancel</button>
      </div>
    </form>`;
}

function renderRepositories() {
  const showChangeAction = canChangeRepository(selectedRepository());
  const rows = state.repositories.length ? state.repositories.map((file) => `
    <tr class="${selectedRepositoryId === file.id ? "selected-row" : ""}">
      <td><input type="radio" name="selectedFile" value="${escapeHtml(file.id)}" ${selectedRepositoryId === file.id ? "checked" : ""} /></td>
      <td><strong>${escapeHtml(file.name)}</strong></td>
      <td class="data-desc-cell">${escapeHtml(file.notes)}</td>
      <td>${repositoryLinkHtml(file.url)}</td>
      <td>${escapeHtml(contributorNameForRepository(file))}</td>
      <td>${ingestionStatusPill(file)}</td>
    </tr>
  `).join("") : `<tr><td colspan="6" class="empty-cell">No data sources added.</td></tr>`;

  return `
    <section class="worksheet-stack">
      <section class="panel table-panel roster-panel">
        <div class="panel-heading">
          <div>
            <h2>Data Worksheet</h2>
            <span class="panel-subtitle">Browse knowledge sources, select a row, then add or change through the audited form.</span>
          </div>
          <div class="button-row">
            <button class="button button-secondary" id="addFileRecord">${icon("plus")}Add</button>
            ${showChangeAction ? `<button class="button button-primary" id="changeFileRecord">${icon("pencil")}Change</button>` : ""}
          </div>
        </div>
        <div class="table-wrap roster-wrap">
          <table class="roster-table files-roster">
            <thead><tr><th></th><th>Name</th><th>Desc</th><th>Link</th><th>Contributor</th><th>Initial Model Ingestion Status</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </section>
      ${renderFileForm()}
    </section>`;
}

function renderWorkers() {
  const search = normalizeName(workerSearch);
  const workers = (search
    ? state.workers.filter((worker) => normalizeName(workerLabel(worker)).includes(search))
    : state.workers);
  const rows = workers.length ? workers.map((worker) => `
    <tr>
      <td><strong>${escapeHtml(worker.fullName || worker.email)}</strong><small>${escapeHtml(worker.email || worker.workerId)}</small></td>
      <td>${escapeHtml(worker.title)}</td>
      <td>${escapeHtml(worker.practice)}</td>
      <td>${escapeHtml(worker.discipline)}</td>
      <td>${escapeHtml(worker.location)}</td>
      <td>${escapeHtml(worker.level)}</td>
      <td>${statusPill(worker.status || "Active")}</td>
    </tr>
  `).join("") : `<tr><td colspan="7" class="empty-cell">No worker records.</td></tr>`;
  const asOf = state.workerSourceUpdatedAt || state.workerImportedAt || "";

  return `
    <section class="worksheet-stack">
      <section class="panel table-panel roster-panel">
        <div class="panel-heading">
          <div>
            <h2>Workers</h2>
            <span class="panel-subtitle">As of ${escapeHtml(asOf || "not loaded")}. Refresh people data feature is disabled for now.</span>
          </div>
          <div class="button-row">
            ${statusPill(`${state.workers.length} records`)}
            <button class="button button-secondary" id="getLatestWorkers" disabled title="Refresh people data feature is disabled for now">${icon("refresh-cw")}Refresh disabled</button>
            <label class="button button-secondary file-button">${icon("upload")}Upload worker file
              <input type="file" id="workerFile" accept=".xlsx,.xls,.csv,.json" />
            </label>
          </div>
        </div>
        <label>Search workers
          <div class="input-with-icon">${icon("search")}<input id="workerSearch" value="${escapeHtml(workerSearch)}" /></div>
        </label>
        <div class="table-wrap">
          <table class="workers-table">
            <thead><tr><th>Name</th><th>Title</th><th>Practice</th><th>Discipline</th><th>Location</th><th>Level</th><th>Status</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </section>
    </section>`;
}

function renderExcelStorage() {
  return `
    <section class="worksheet-stack">
      <section class="panel form-panel admin-control-panel">
        <div class="panel-heading">
          <h2>Excel Storage</h2>
          ${statusPill(state.workbookName || "Workbook")}
        </div>
        <label>Workbook name<input id="workbookName" value="${escapeHtml(state.workbookName)}" /></label>
        <div class="button-row">
          <button class="button button-primary" id="exportWorkbook">${icon("download")}Export workbook</button>
          <label class="button button-secondary file-button">${icon("upload")}Import workbook
            <input type="file" id="portalWorkbookFile" accept=".xlsx,.xls" />
          </label>
        </div>
      </section>
    </section>`;
}

function auditLogRows() {
  return state.audit.length ? state.audit.slice().reverse().map((entry) => `
    <tr>
      <td>${entry.index}</td>
      <td>${escapeHtml(formatDateTime(entry.timestamp))}</td>
      <td>${escapeHtml(entry.actor)}</td>
      <td>${escapeHtml(entry.action)}</td>
      <td>${escapeHtml(entry.entityType)}</td>
      <td>${escapeHtml(entry.entityId)}</td>
      <td class="audit-summary-cell">${escapeHtml(entry.summary)}</td>
      <td><code class="hash-cell">${escapeHtml(String(entry.previousHash || "").slice(0, 18))}</code></td>
      <td><code class="hash-cell">${escapeHtml(String(entry.hash || "").slice(0, 18))}</code></td>
    </tr>
  `).join("") : `<tr><td colspan="9" class="empty-cell">No audit entries.</td></tr>`;
}

function renderAuditChain() {
  const verifyHtml = verifyResult ? `
    <div class="verify-box">
      <strong>${verifyResult.checked} entries checked</strong>
      ${verifyResult.errors.length
        ? `<ul>${verifyResult.errors.slice(0, 5).map((error) => `<li>${escapeHtml(error)}</li>`).join("")}</ul>`
        : "<span>No verification issues.</span>"}
    </div>` : "";

  return `
    <section class="worksheet-stack">
      <section class="panel form-panel admin-control-panel">
        <div class="panel-heading"><h2>Audit Chain</h2>${statusPill(verifyResult ? (verifyResult.valid ? "Verified" : "Issues") : "Not checked")}</div>
        <div class="button-row">
          <button class="button button-primary" id="verifyAudit">${icon("shield-check")}Verify chain</button>
          <button class="button button-secondary" id="exportAudit">${icon("download")}Export audit</button>
          <label class="button button-secondary file-button">${icon("upload")}Import audit
            <input type="file" id="auditFile" accept=".jsonl,.json,.txt" />
          </label>
        </div>
        ${verifyHtml}
        <button class="button button-danger" id="resetLocal">${icon("refresh-cw")}Reset local data</button>
      </section>
      <section class="panel table-panel wide">
        <div class="panel-heading"><h2>Audit Log</h2>${statusPill(`${state.audit.length} entries`)}</div>
        <div class="table-wrap">
          <table class="audit-log-table">
            <thead><tr><th>#</th><th>Timestamp</th><th>Actor</th><th>Action</th><th>Entity</th><th>Entity ID</th><th>Summary</th><th>Previous Hash</th><th>Hash</th></tr></thead>
            <tbody>${auditLogRows()}</tbody>
          </table>
        </div>
      </section>
    </section>`;
}

function renderContent() {
  if (activeTab === "people") return renderPeople();
  if (activeTab === "capacities") return renderCapacities();
  if (activeTab === "repositories") return renderRepositories();
  if (activeTab === "workers") return renderWorkers();
  if (activeTab === "excelStorage") return renderExcelStorage();
  return renderAuditChain();
}

function render() {
  app.innerHTML = `
    <header class="app-header">
      <div>
        <p class="eyebrow">Pilot and launch governance</p>
        <h1>Diligence.AI Config Portal [ALPHA]</h1>
      </div>
    </header>
    ${noticeHtml()}
    <div class="portal-layout">
      ${tabsHtml()}
      <section class="content-area">
        ${renderContent()}
      </section>
    </div>
  `;

  if (window.lucide) {
    window.lucide.createIcons({ attrs: { width: 16, height: 16, "stroke-width": 2 } });
  }
}

document.addEventListener("submit", (event) => {
  if (event.target.id === "personForm") {
    event.preventDefault();
    void savePerson(event.target);
  }
  if (event.target.id === "capacityForm") {
    event.preventDefault();
    void saveCapacity(event.target);
  }
  if (event.target.id === "repositoryForm") {
    event.preventDefault();
    void saveRepository(event.target);
  }
});

document.addEventListener("click", (event) => {
  const target = event.target.closest("button, [data-tab]");
  if (!target) return;

  if (target.dataset.tab) {
    activeTab = target.dataset.tab;
    render();
    return;
  }

  if (target.dataset.filterPeopleSkill) {
    peopleSkillFilterId = target.dataset.filterPeopleSkill;
    activeTab = "people";
    editPersonId = "";
    selectedPersonId = "";
    render();
    return;
  }

  if (target.id === "dismissNotice") {
    notice = null;
    render();
    return;
  }

  if (target.id === "clearPeopleSkillFilter") {
    peopleSkillFilterId = "";
    selectedPersonId = "";
    render();
    return;
  }

  if (target.id === "headerExportWorkbook" || target.id === "exportWorkbook") {
    try {
      exportPortalWorkbook();
    } catch (error) {
      notice = { tone: "danger", text: error.message || "Workbook export failed." };
      render();
    }
    return;
  }

  if (target.id === "getLatestWorkers") {
    notice = { tone: "warning", text: "Refresh people data feature is disabled for now. Upload a worker file to update the people directory." };
    render();
    return;
  }

  if (target.id === "addPersonRecord") {
    editPersonId = "new";
    render();
    return;
  }

  if (target.id === "changePersonRecord") {
    if (!hasSelectedVisiblePerson()) {
      notice = { tone: "warning", text: "Select a person row before choosing Change." };
      render();
      return;
    }
    editPersonId = selectedPersonId;
    render();
    return;
  }

  if (target.id === "cancelPersonForm" || target.id === "cancelPersonFormAlt") {
    editPersonId = "";
    render();
    return;
  }

  if (target.id === "deletePersonRecord") {
    const person = state.people.find((candidate) => candidate.id === editPersonId);
    if (person && window.confirm(`Delete ${person.fullName} from the people worksheet?`)) {
      void deletePerson();
    }
    return;
  }

  if (target.id === "deleteSelectedPersonRecord") {
    const person = state.people.find((candidate) => candidate.id === selectedPersonId);
    if (person && hasSelectedVisiblePerson() && window.confirm(`Delete ${person.fullName} from the people worksheet?`)) {
      editPersonId = person.id;
      void deletePerson();
    }
    return;
  }

  if (target.id === "addSkillRecord") {
    editCapacityId = "new";
    render();
    return;
  }

  if (target.id === "changeSkillRecord") {
    if (!hasSelectedSkill()) {
      notice = { tone: "warning", text: "Select a skill row before choosing Change." };
      render();
      return;
    }
    editCapacityId = selectedCapacityId;
    render();
    return;
  }

  if (target.id === "cancelSkillForm" || target.id === "cancelSkillFormAlt") {
    editCapacityId = "";
    render();
    return;
  }

  if (target.id === "deleteSkillRecord") {
    const skill = state.capacities.find((candidate) => candidate.id === editCapacityId);
    if (skill && window.confirm(`Delete skill ${skill.name}? This will remove its people assignments.`)) {
      void deleteCapacity();
    }
    return;
  }

  if (target.id === "deleteSelectedSkillRecord") {
    const skill = state.capacities.find((candidate) => candidate.id === selectedCapacityId);
    if (skill && window.confirm(`Delete skill ${skill.name}? This will remove its people assignments.`)) {
      editCapacityId = skill.id;
      void deleteCapacity();
    }
    return;
  }

  if (target.id === "addFileRecord") {
    editRepositoryId = "new";
    render();
    return;
  }

  if (target.id === "changeFileRecord") {
    const repository = selectedRepository();
    if (!repository) {
      notice = { tone: "warning", text: "Select a data row before choosing Change." };
      render();
      return;
    }
    if (!canChangeRepository(repository)) {
      notice = { tone: "warning", text: "Data can only be changed before ingestion review starts." };
      render();
      return;
    }
    editRepositoryId = selectedRepositoryId;
    render();
    return;
  }

  if (target.id === "cancelFileForm" || target.id === "cancelFileFormAlt") {
    editRepositoryId = "";
    render();
    return;
  }

  if (target.id === "newPerson") {
    editPersonId = "";
    render();
    return;
  }

  if (target.id === "newCapacity") {
    editCapacityId = "";
    render();
    return;
  }

  if (target.id === "newRepository") {
    editRepositoryId = "";
    render();
    return;
  }

  if (target.dataset.editPerson) {
    editPersonId = target.dataset.editPerson;
    activeTab = "people";
    render();
    return;
  }

  if (target.dataset.editCapacity) {
    editCapacityId = target.dataset.editCapacity;
    activeTab = "capacities";
    render();
    return;
  }

  if (target.dataset.editRepository) {
    editRepositoryId = target.dataset.editRepository;
    activeTab = "repositories";
    render();
    return;
  }

  if (target.id === "saveAssignments") {
    void saveAssignments();
    return;
  }

  if (target.id === "verifyAudit") {
    void verifyAuditChain(state.audit).then((result) => {
      verifyResult = result;
      notice = { tone: result.valid ? "success" : "warning", text: result.valid ? "Audit chain verified." : "Audit chain has verification issues." };
      render();
    });
    return;
  }

  if (target.id === "exportAudit") {
    downloadTextFile("diligence-ai-audit.jsonl", auditToJsonl());
    return;
  }

  if (target.id === "resetLocal") {
    if (window.confirm("Reset local portal data in this browser?")) {
      localStorage.removeItem(STORAGE_KEY);
      state = createInitialState();
      activeTab = "people";
      editPersonId = "";
      editCapacityId = "";
      editRepositoryId = "";
      assignmentPersonId = "";
      draftPersonVisible = false;
      draftCapacityVisible = false;
      draftRepositoryVisible = false;
      peopleSkillFilterId = "";
      verifyResult = null;
      notice = { tone: "warning", text: "Local portal data reset." };
      render();
    }
  }
});

document.addEventListener("change", (event) => {
  const target = event.target;

  if (target.name === "selectedPerson") {
    selectedPersonId = target.value;
    render();
    return;
  }

  if (target.name === "selectedSkill") {
    selectedCapacityId = target.value;
    render();
    return;
  }

  if (target.name === "selectedFile") {
    selectedRepositoryId = target.value;
    render();
    return;
  }

  if (target.id === "assignmentPerson") {
    assignmentPersonId = target.value;
    render();
    return;
  }

  if (target.id === "workerFile") {
    const file = target.files?.[0];
    target.value = "";
    if (file) void importWorkerFile(file);
    return;
  }

  if (target.id === "portalWorkbookFile") {
    const file = target.files?.[0];
    target.value = "";
    if (file) void importPortalWorkbook(file);
    return;
  }

  if (target.id === "auditFile") {
    const file = target.files?.[0];
    target.value = "";
    if (file) void importAuditFile(file);
  }
});

document.addEventListener("input", (event) => {
  const target = event.target;
  if (target.id === "actorInput") {
    state.actor = target.value;
    saveState();
  }
  if (target.id === "workbookName") {
    state.workbookName = target.value;
    saveState();
  }
});

document.addEventListener("keyup", (event) => {
  const target = event.target;
  if (target.id === "workerSearch" && event.key === "Enter") {
    workerSearch = target.value;
    render();
  }
});

render();
void loadMaskedPeopleSeed();
