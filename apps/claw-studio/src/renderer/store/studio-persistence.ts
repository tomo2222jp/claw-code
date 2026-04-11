import type { Locale } from "../i18n/index.js";
import type {
  ProjectMemory,
  ProjectMemoryCandidate,
  ProjectMemoryCandidateCreatedBy,
  StudioProject,
  StudioSession,
  TimelineEvent,
} from "./studio-store.js";

export const STUDIO_STATE_VERSION = 4;

export type PersistedStudioStateV1 = {
  version: 1;
  savedAt: string;
  ui: {
    locale: Locale;
    selectedProjectId: string | null;
    selectedSessionId: string | null;
    sidebarCollapsed: boolean;
  };
  workspace: {
    projects: StudioProject[];
    sessions: StudioSession[];
    timelineBySessionId: Record<string, TimelineEvent[]>;
  };
};

export type PersistedStudioStateV2 = {
  version: 2;
  savedAt: string;
  ui: {
    locale: Locale;
    selectedProjectId: string | null;
    selectedSessionId: string | null;
    sidebarCollapsed: boolean;
  };
  workspace: {
    projects: StudioProject[];
    sessions: StudioSession[];
    timelineBySessionId: Record<string, TimelineEvent[]>;
    projectMemoryByProjectId: Record<string, ProjectMemory>;
  };
};

export type PersistedStudioStateV3 = {
  version: 3;
  savedAt: string;
  ui: {
    locale: Locale;
    selectedProjectId: string | null;
    selectedSessionId: string | null;
    sidebarCollapsed: boolean;
  };
  workspace: {
    projects: StudioProject[];
    sessions: StudioSession[];
    timelineBySessionId: Record<string, TimelineEvent[]>;
    projectMemoryByProjectId: Record<string, ProjectMemory>;
    projectMemoryCandidatesByProjectId: Record<string, ProjectMemoryCandidate[]>;
  };
};

export type PersistedStudioStateV4 = {
  version: 4;
  savedAt: string;
  ui: {
    locale: Locale;
    selectedProjectId: string | null;
    selectedSessionId: string | null;
    sidebarCollapsed: boolean;
  };
  workspace: {
    projects: StudioProject[];
    sessions: StudioSession[];
    timelineBySessionId: Record<string, TimelineEvent[]>;
    projectMemoryByProjectId: Record<string, ProjectMemory>;
    projectMemoryCandidatesByProjectId: Record<string, ProjectMemoryCandidate[]>;
  };
};

export type RuntimeStudioStateSnapshot = {
  locale: Locale;
  projects: StudioProject[];
  sessions: StudioSession[];
  timelineEvents: TimelineEvent[];
  projectMemoryByProjectId: Record<string, ProjectMemory>;
  projectMemoryCandidatesByProjectId: Record<string, ProjectMemoryCandidate[]>;
  selectedProjectId: string;
  selectedSessionId: string;
  sidebarCollapsed: boolean;
};

export function toPersistedStudioState(
  snapshot: RuntimeStudioStateSnapshot,
): PersistedStudioStateV4 {
  return {
    version: STUDIO_STATE_VERSION,
    savedAt: new Date().toISOString(),
    ui: {
      locale: snapshot.locale,
      selectedProjectId: snapshot.selectedProjectId,
      selectedSessionId: snapshot.selectedSessionId,
      sidebarCollapsed: snapshot.sidebarCollapsed,
    },
    workspace: {
      projects: snapshot.projects,
      sessions: snapshot.sessions,
      timelineBySessionId: groupTimelineBySessionId(snapshot.timelineEvents),
      projectMemoryByProjectId: snapshot.projectMemoryByProjectId,
      projectMemoryCandidatesByProjectId: snapshot.projectMemoryCandidatesByProjectId,
    },
  };
}

export function fromPersistedStudioState(
  raw: unknown,
): RuntimeStudioStateSnapshot | null {
  const migrated = migratePersistedStudioState(raw);
  if (!migrated) {
    return null;
  }

  const projects = migrated.workspace.projects;
  const sessions = migrated.workspace.sessions;
  const timelineEvents = Object.values(migrated.workspace.timelineBySessionId).flat();

  const selectedSession = migrated.ui.selectedSessionId
    ? sessions.find((session) => session.id === migrated.ui.selectedSessionId) ?? null
    : null;
  const selectedProjectId =
    selectedSession?.projectId ??
    (migrated.ui.selectedProjectId && projects.some((project) => project.id === migrated.ui.selectedProjectId)
      ? migrated.ui.selectedProjectId
      : projects[0]?.id);
  const selectedSessionId =
    sessions.find(
      (session) =>
        session.projectId === selectedProjectId &&
        session.id === (selectedSession?.id ?? migrated.ui.selectedSessionId),
    )?.id ??
    sessions.find((session) => session.projectId === selectedProjectId)?.id ??
    sessions[0]?.id;

  if (!selectedProjectId || !selectedSessionId) {
    return null;
  }

  return {
    locale: migrated.ui.locale,
    projects,
    sessions,
    timelineEvents,
    projectMemoryByProjectId: ensureProjectMemoryMap(
      projects,
      migrated.workspace.projectMemoryByProjectId,
    ),
    projectMemoryCandidatesByProjectId: ensureProjectMemoryCandidateMap(
      projects,
      migrated.workspace.projectMemoryCandidatesByProjectId,
    ),
    selectedProjectId,
    selectedSessionId,
    sidebarCollapsed: migrated.ui.sidebarCollapsed,
  };
}

function groupTimelineBySessionId(
  timelineEvents: TimelineEvent[],
): Record<string, TimelineEvent[]> {
  return timelineEvents.reduce<Record<string, TimelineEvent[]>>((accumulator, event) => {
    const sessionTimeline = accumulator[event.sessionId] ?? [];
    sessionTimeline.push(event);
    accumulator[event.sessionId] = sessionTimeline;
    return accumulator;
  }, {});
}

function migratePersistedStudioState(
  raw: unknown,
): PersistedStudioStateV4 | null {
  if (isPersistedStudioStateV4(raw)) {
    return raw;
  }

  if (isPersistedStudioStateV3(raw)) {
    return {
      version: 4,
      savedAt: raw.savedAt,
      ui: raw.ui,
      workspace: raw.workspace,
    };
  }

  if (isPersistedStudioStateV2(raw)) {
    return {
      version: 4,
      savedAt: raw.savedAt,
      ui: raw.ui,
      workspace: {
        ...raw.workspace,
        projectMemoryCandidatesByProjectId: createDefaultProjectMemoryCandidateMap(raw.workspace.projects),
      },
    };
  }

  if (!isPersistedStudioStateV1(raw)) {
    return null;
  }

  return {
    version: 4,
    savedAt: raw.savedAt,
    ui: raw.ui,
    workspace: {
      ...raw.workspace,
      projectMemoryByProjectId: createDefaultProjectMemoryMap(raw.workspace.projects),
      projectMemoryCandidatesByProjectId: createDefaultProjectMemoryCandidateMap(raw.workspace.projects),
    },
  };
}

function isPersistedStudioStateV1(raw: unknown): raw is PersistedStudioStateV1 {
  if (!raw || typeof raw !== "object") {
    return false;
  }

  const candidate = raw as Partial<PersistedStudioStateV1>;
  return (
    candidate.version === 1 &&
    typeof candidate.savedAt === "string" &&
    isLocale(candidate.ui?.locale) &&
    typeof candidate.ui?.selectedProjectId !== "undefined" &&
    typeof candidate.ui?.selectedSessionId !== "undefined" &&
    typeof candidate.ui?.sidebarCollapsed === "boolean" &&
    Array.isArray(candidate.workspace?.projects) &&
    Array.isArray(candidate.workspace?.sessions) &&
    Boolean(candidate.workspace?.timelineBySessionId) &&
    typeof candidate.workspace?.timelineBySessionId === "object"
  );
}

function isPersistedStudioStateV2(raw: unknown): raw is PersistedStudioStateV2 {
  if (!raw || typeof raw !== "object") {
    return false;
  }

  const candidate = raw as Partial<PersistedStudioStateV2>;
  return (
    candidate.version === 2 &&
    typeof candidate.savedAt === "string" &&
    isLocale(candidate.ui?.locale) &&
    typeof candidate.ui?.selectedProjectId !== "undefined" &&
    typeof candidate.ui?.selectedSessionId !== "undefined" &&
    typeof candidate.ui?.sidebarCollapsed === "boolean" &&
    Array.isArray(candidate.workspace?.projects) &&
    Array.isArray(candidate.workspace?.sessions) &&
    Boolean(candidate.workspace?.timelineBySessionId) &&
    typeof candidate.workspace?.timelineBySessionId === "object" &&
    Boolean(candidate.workspace?.projectMemoryByProjectId) &&
    typeof candidate.workspace?.projectMemoryByProjectId === "object"
  );
}

function isPersistedStudioStateV3(raw: unknown): raw is PersistedStudioStateV3 {
  if (!raw || typeof raw !== "object") {
    return false;
  }

  const candidate = raw as Partial<PersistedStudioStateV3>;
  return (
    candidate.version === 3 &&
    typeof candidate.savedAt === "string" &&
    isLocale(candidate.ui?.locale) &&
    typeof candidate.ui?.selectedProjectId !== "undefined" &&
    typeof candidate.ui?.selectedSessionId !== "undefined" &&
    typeof candidate.ui?.sidebarCollapsed === "boolean" &&
    Array.isArray(candidate.workspace?.projects) &&
    Array.isArray(candidate.workspace?.sessions) &&
    Boolean(candidate.workspace?.timelineBySessionId) &&
    typeof candidate.workspace?.timelineBySessionId === "object" &&
    Boolean(candidate.workspace?.projectMemoryByProjectId) &&
    typeof candidate.workspace?.projectMemoryByProjectId === "object" &&
    Boolean(candidate.workspace?.projectMemoryCandidatesByProjectId) &&
    typeof candidate.workspace?.projectMemoryCandidatesByProjectId === "object"
  );
}

function isPersistedStudioStateV4(raw: unknown): raw is PersistedStudioStateV4 {
  if (!raw || typeof raw !== "object") {
    return false;
  }

  const candidate = raw as Partial<PersistedStudioStateV4>;
  return (
    candidate.version === STUDIO_STATE_VERSION &&
    typeof candidate.savedAt === "string" &&
    isLocale(candidate.ui?.locale) &&
    typeof candidate.ui?.selectedProjectId !== "undefined" &&
    typeof candidate.ui?.selectedSessionId !== "undefined" &&
    typeof candidate.ui?.sidebarCollapsed === "boolean" &&
    Array.isArray(candidate.workspace?.projects) &&
    Array.isArray(candidate.workspace?.sessions) &&
    Boolean(candidate.workspace?.timelineBySessionId) &&
    typeof candidate.workspace?.timelineBySessionId === "object" &&
    Boolean(candidate.workspace?.projectMemoryByProjectId) &&
    typeof candidate.workspace?.projectMemoryByProjectId === "object" &&
    Boolean(candidate.workspace?.projectMemoryCandidatesByProjectId) &&
    typeof candidate.workspace?.projectMemoryCandidatesByProjectId === "object"
  );
}

function createDefaultProjectMemoryMap(
  projects: StudioProject[],
): Record<string, ProjectMemory> {
  return projects.reduce<Record<string, ProjectMemory>>((accumulator, project) => {
    accumulator[project.id] = createEmptyProjectMemory();
    return accumulator;
  }, {});
}

function createDefaultProjectMemoryCandidateMap(
  projects: StudioProject[],
): Record<string, ProjectMemoryCandidate[]> {
  return projects.reduce<Record<string, ProjectMemoryCandidate[]>>((accumulator, project) => {
    accumulator[project.id] = [];
    return accumulator;
  }, {});
}

function ensureProjectMemoryMap(
  projects: StudioProject[],
  rawMap: Record<string, ProjectMemory>,
): Record<string, ProjectMemory> {
  const nextMap = createDefaultProjectMemoryMap(projects);

  for (const project of projects) {
    const existing = rawMap[project.id];
    if (!existing) {
      continue;
    }
    nextMap[project.id] = {
      summary: typeof existing.summary === "string" ? existing.summary : "",
      rules: Array.isArray(existing.rules) ? existing.rules.filter(isString) : [],
      decisions: Array.isArray(existing.decisions) ? existing.decisions.filter(isString) : [],
      currentFocus: Array.isArray(existing.currentFocus) ? existing.currentFocus.filter(isString) : [],
      updatedAt: typeof existing.updatedAt === "string" ? existing.updatedAt : new Date().toISOString(),
    };
  }

  return nextMap;
}

function ensureProjectMemoryCandidateMap(
  projects: StudioProject[],
  rawMap: Record<string, ProjectMemoryCandidate[]>,
): Record<string, ProjectMemoryCandidate[]> {
  const nextMap = createDefaultProjectMemoryCandidateMap(projects);

  for (const project of projects) {
    const rawCandidates = rawMap[project.id];
    if (!Array.isArray(rawCandidates)) {
      continue;
    }

    nextMap[project.id] = rawCandidates
      .filter((candidate) => candidate && typeof candidate === "object")
      .map((candidate): ProjectMemoryCandidate => {
        const typedCandidate = candidate as Partial<ProjectMemoryCandidate>;
        return {
          id: typeof typedCandidate.id === "string" ? typedCandidate.id : crypto.randomUUID(),
          projectId: typeof typedCandidate.projectId === "string" ? typedCandidate.projectId : project.id,
          sourceSessionId:
            typeof typedCandidate.sourceSessionId === "string" ? typedCandidate.sourceSessionId : undefined,
          sourceTimelineEventId:
            typeof typedCandidate.sourceTimelineEventId === "string"
              ? typedCandidate.sourceTimelineEventId
              : undefined,
          kind: isProjectMemoryCandidateKind(typedCandidate.kind) ? typedCandidate.kind : "pinned",
          content: typeof typedCandidate.content === "string" ? typedCandidate.content : "",
          createdAt: typeof typedCandidate.createdAt === "string" ? typedCandidate.createdAt : new Date().toISOString(),
          createdBy: isProjectMemoryCandidateCreatedBy(typedCandidate.createdBy)
            ? typedCandidate.createdBy
            : "user_explicit",
          status: isProjectMemoryCandidateStatus(typedCandidate.status) ? typedCandidate.status : "pending",
        };
      })
      .filter((candidate) => candidate.content.trim().length > 0);
  }

  return nextMap;
}

function createEmptyProjectMemory(): ProjectMemory {
  return {
    summary: "",
    rules: [],
    decisions: [],
    currentFocus: [],
    updatedAt: new Date().toISOString(),
  };
}

function isLocale(value: unknown): value is Locale {
  return value === "ja" || value === "en";
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isProjectMemoryCandidateKind(value: unknown): value is ProjectMemoryCandidate["kind"] {
  return (
    value === "rule" ||
    value === "decision" ||
    value === "current_focus" ||
    value === "pinned"
  );
}

function isProjectMemoryCandidateStatus(value: unknown): value is ProjectMemoryCandidate["status"] {
  return value === "pending" || value === "accepted" || value === "rejected";
}

function isProjectMemoryCandidateCreatedBy(
  value: unknown,
): value is ProjectMemoryCandidateCreatedBy {
  return value === "user_explicit" || value === "assistant_suggested";
}
