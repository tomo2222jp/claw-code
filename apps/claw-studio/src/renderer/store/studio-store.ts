import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { RunStatus } from "../../../../../claw-ui/shared/contracts/index.js";
import {
  ApiClientError,
  getHealth,
  getRunLogs,
  getRunStatus,
  getSettings,
  saveSettings,
  startRun,
  stopRun,
  type AppSettings,
  type LocalApiHealth,
  type RunStatusResponse,
} from "../api/local-api-client.js";
import type { Locale } from "../i18n/index.js";
import { classifyStderrLine, normalizeTerminalText } from "../utils/terminal-text.js";
import {
  fromPersistedStudioState,
  toPersistedStudioState,
} from "./studio-persistence.js";

export type StudioProject = {
  id: string;
  name: string;
  description?: string;
  locale?: "ja" | "en";
  pinnedContext?: string;
};

export type PermissionMode = "default" | "full_access";

export type AgentRole = "default" | "planner" | "builder" | "reviewer";

export type ProjectMemory = {
  summary: string;
  rules: string[];
  decisions: string[];
  currentFocus: string[];
  updatedAt: string;
};

export type ProjectMemoryCandidateKind =
  | "rule"
  | "decision"
  | "current_focus"
  | "pinned";

export type ProjectMemoryCandidateCreatedBy =
  | "user_explicit"
  | "assistant_suggested";

export type ProjectMemoryCandidate = {
  id: string;
  projectId: string;
  sourceSessionId?: string;
  sourceTimelineEventId?: string;
  kind: ProjectMemoryCandidateKind;
  content: string;
  createdAt: string;
  createdBy: ProjectMemoryCandidateCreatedBy;
  status: "pending" | "accepted" | "rejected";
};

export type ProjectMemorySuggestionKind = Exclude<ProjectMemoryCandidateKind, "pinned">;

export type ProjectMemorySuggestion = {
  id: string;
  projectId: string;
  sourceSessionId?: string;
  sourceTimelineEventId?: string;
  suggestedKind: ProjectMemorySuggestionKind;
  content: string;
  createdAt: string;
};

type DurableProjectMemorySection = "rules" | "decisions" | "currentFocus";

export type StudioSession = {
  id: string;
  projectId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  handoffSummary?: string;
  permissionMode?: PermissionMode;
  role?: AgentRole;
};

export type TimelineEvent =
  | { id: string; sessionId: string; type: "user_message"; createdAt: string; text: string }
  | { id: string; sessionId: string; type: "assistant_message"; createdAt: string; text: string }
  | { id: string; sessionId: string; type: "system_note"; createdAt: string; text: string }
  | { id: string; sessionId: string; type: "run_started"; createdAt: string; runId: string }
  | {
      id: string;
      sessionId: string;
      type: "run_status";
      createdAt: string;
      runId: string;
      status: Exclude<RunStatus, "idle" | "starting">;
    }
  | { id: string; sessionId: string; type: "log_stdout"; createdAt: string; runId: string; text: string }
  | { id: string; sessionId: string; type: "log_stderr_meta"; createdAt: string; runId: string; text: string }
  | { id: string; sessionId: string; type: "log_stderr"; createdAt: string; runId: string; text: string }
  | { id: string; sessionId: string; type: "log_system"; createdAt: string; runId: string; text: string }
  | { id: string; sessionId: string; type: "final_output"; createdAt: string; runId: string; text: string }
  | { id: string; sessionId: string; type: "error"; createdAt: string; runId?: string; message: string };

type TimelineEventInput = TimelineEvent extends infer T
  ? T extends { id: string }
    ? Omit<T, "id">
    : never
  : never;

type HealthState = {
  connected: boolean;
  label: string;
  tone: "success" | "danger";
  lastCheckedAt?: string;
};

type ActiveRunTracker = {
  sessionId: string;
  runId: string;
  lastStatus: RunStatus;
  seenLogCount: number;
  emittedErrorMessage?: string;
  finalOutputEmitted: boolean;
};

const HEALTH_POLL_MS = 5_000;
const RUN_POLL_MS = 1_500;

const INITIAL_PROJECTS: StudioProject[] = [
  {
    id: "proj-claw-studio",
    name: "claw-ui",
    description: "Desktop workspace shell",
    locale: "ja",
    pinnedContext: "first slice bootstrap",
  },
  {
    id: "proj-side-eye",
    name: "Side-Eye",
    description: "Triage and handoff practice",
    locale: "en",
  },
  {
    id: "proj-portal",
    name: "Portal",
    description: "Operator workflow review",
    locale: "en",
  },
];

const INITIAL_SESSIONS: StudioSession[] = [
  {
    id: "session-shell",
    projectId: "proj-claw-studio",
    title: "first slice shell",
    createdAt: "2026-04-10T03:30:00.000Z",
    updatedAt: "2026-04-10T03:45:00.000Z",
    handoffSummary: "Scaffold the desktop workspace shell first.",
  },
  {
    id: "session-timeline",
    projectId: "proj-claw-studio",
    title: "timeline design",
    createdAt: "2026-04-10T04:00:00.000Z",
    updatedAt: "2026-04-10T04:15:00.000Z",
    handoffSummary: "Keep local-api as the state owner.",
  },
  {
    id: "session-hookup",
    projectId: "proj-claw-studio",
    title: "local-api hookup",
    createdAt: "2026-04-10T04:20:00.000Z",
    updatedAt: "2026-04-10T04:25:00.000Z",
  },
  {
    id: "session-side-eye",
    projectId: "proj-side-eye",
    title: "ghost preview v1",
    createdAt: "2026-04-09T14:30:00.000Z",
    updatedAt: "2026-04-09T14:45:00.000Z",
  },
  {
    id: "session-portal",
    projectId: "proj-portal",
    title: "auth flow",
    createdAt: "2026-04-08T11:00:00.000Z",
    updatedAt: "2026-04-08T11:15:00.000Z",
  },
];

const INITIAL_EVENTS: TimelineEvent[] = [
  {
    id: "evt-sys-1",
    sessionId: "session-timeline",
    type: "system_note",
    createdAt: "2026-04-10T04:01:00.000Z",
    text: "Use the timeline as the primary surface. Run, logs, and output should stay in one stream.",
  },
  {
    id: "evt-ai-1",
    sessionId: "session-timeline",
    type: "assistant_message",
    createdAt: "2026-04-10T04:05:00.000Z",
    text: "Composer should feel direct: Enter to send, Shift+Enter for newline, and the newest activity should stay near the bottom.",
  },
  {
    id: "evt-user-1",
    sessionId: "session-shell",
    type: "user_message",
    createdAt: "2026-04-10T03:42:00.000Z",
    text: "Set up the desktop shell first and keep local-api as the truth for run state.",
  },
  {
    id: "evt-ai-2",
    sessionId: "session-shell",
    type: "assistant_message",
    createdAt: "2026-04-10T03:44:00.000Z",
    text: "Use a narrow sidebar, a compact topbar, and a timeline that can later absorb run status, logs, and final output without redesign.",
  },
];

const INITIAL_PROJECT_MEMORY: Record<string, ProjectMemory> = {
  "proj-claw-studio": {
    summary:
      "Desktop coding workspace for Claw. React + TypeScript + Electron shell over local-api.",
    rules: [
      "Keep local-api as the run truth and state owner.",
      "Keep debug information behind Details in the normal workspace.",
      "Prefer low-noise operator workflows over settings-heavy UI.",
    ],
    decisions: [
      "Timeline remains the primary surface.",
      "Project memory stays secondary and reviewable.",
      "Sidebar defaults to a collapsed icon rail.",
    ],
    currentFocus: [
      "v2 workspace shell",
      "project memory overlay",
      "operator usability",
    ],
    updatedAt: "2026-04-11T05:50:00.000Z",
  },
  "proj-side-eye": {
    summary: "Small review space for triage and handoff experiments.",
    rules: ["Keep experiments lightweight and easy to discard."],
    decisions: ["Treat this project as a sandbox rather than product surface."],
    currentFocus: ["ghost preview ideas"],
    updatedAt: "2026-04-11T05:50:00.000Z",
  },
  "proj-portal": {
    summary: "Operator workflow review area for future auth and workflow iterations.",
    rules: ["Do not let this overtake claw-studio's main execution path."],
    decisions: ["Portal remains secondary until the main workspace is stable."],
    currentFocus: ["auth flow notes"],
    updatedAt: "2026-04-11T05:50:00.000Z",
  },
};

const INITIAL_PROJECT_MEMORY_CANDIDATES: Record<string, ProjectMemoryCandidate[]> = {
  "proj-claw-studio": [
    {
      id: "cand-pin-1",
      projectId: "proj-claw-studio",
      sourceSessionId: "session-timeline",
      sourceTimelineEventId: "evt-ai-1",
      kind: "pinned",
      content:
        "Composer should feel direct: Enter to send, Shift+Enter for newline, and the newest activity should stay near the bottom.",
      createdAt: "2026-04-11T06:20:00.000Z",
      createdBy: "user_explicit",
      status: "accepted",
    },
  ],
  "proj-side-eye": [],
  "proj-portal": [],
};

const INITIAL_HEALTH: HealthState = {
  connected: false,
  label: "Disconnected",
  tone: "danger",
};

export type StudioState = ReturnType<typeof useStudioState>;

export function useStudioState() {
  const [projects, setProjects] = useState<StudioProject[]>(INITIAL_PROJECTS);
  const [locale, setLocale] = useState<Locale>("ja");
  const [sessions, setSessions] = useState<StudioSession[]>(INITIAL_SESSIONS);
  const [timelineEvents, setTimelineEvents] = useState<TimelineEvent[]>(INITIAL_EVENTS);
  const [projectMemoryByProjectId, setProjectMemoryByProjectId] =
    useState<Record<string, ProjectMemory>>(INITIAL_PROJECT_MEMORY);
  const [projectMemoryCandidatesByProjectId, setProjectMemoryCandidatesByProjectId] =
    useState<Record<string, ProjectMemoryCandidate[]>>(INITIAL_PROJECT_MEMORY_CANDIDATES);
  const [selectedProjectId, setSelectedProjectId] = useState(INITIAL_PROJECTS[0]!.id);
  const [selectedSessionId, setSelectedSessionId] = useState("session-timeline");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [composerValue, setComposerValue] = useState("");
  const [composerAttachments, setComposerAttachments] = useState<Array<{ id: string; data: string; mimeType: string }>>([]);
  const [health, setHealth] = useState<HealthState>(INITIAL_HEALTH);
  const [activeRuns, setActiveRuns] = useState<Record<string, ActiveRunTracker>>({});
  const [didHydratePersistedState, setDidHydratePersistedState] = useState(false);
  const [backendSettings, setBackendSettings] = useState<AppSettings | null>(null);
  const saveTimeoutRef = useRef<number | null>(null);

  const visibleSessions = useMemo(
    () => sessions.filter((session) => session.projectId === selectedProjectId),
    [selectedProjectId, sessions],
  );
  const currentTimeline = useMemo(
    () =>
      timelineEvents
        .filter((event) => event.sessionId === selectedSessionId)
        .sort((left, right) => left.createdAt.localeCompare(right.createdAt)),
    [selectedSessionId, timelineEvents],
  );
  const currentRun = activeRuns[selectedSessionId];
  const currentSession = sessions.find((session) => session.id === selectedSessionId) ?? null;
  const currentProjectMemory = projectMemoryByProjectId[selectedProjectId] ?? createEmptyProjectMemory();
  const currentProjectMemoryCandidates = projectMemoryCandidatesByProjectId[selectedProjectId] ?? [];
  const currentProjectMemorySuggestions = useMemo(
    () =>
      detectProjectMemorySuggestions({
        candidates: currentProjectMemoryCandidates,
        memory: currentProjectMemory,
        projectId: selectedProjectId,
        timelineEvents: currentTimeline,
      }),
    [currentProjectMemory, currentProjectMemoryCandidates, currentTimeline, selectedProjectId],
  );
  const canStop = currentRun && (currentRun.lastStatus === "starting" || currentRun.lastStatus === "running");

  useEffect(() => {
    let cancelled = false;

    const hydratePersistedState = async () => {
      try {
        const payload = await window.clawStudio.loadStudioState();
        if (cancelled) {
          return;
        }

        const restoredState = fromPersistedStudioState(payload);
        if (restoredState) {
          setLocale(restoredState.locale);
          setProjects(restoredState.projects);
          setSessions(restoredState.sessions);
          setTimelineEvents(restoredState.timelineEvents);
          setProjectMemoryByProjectId(restoredState.projectMemoryByProjectId);
          setProjectMemoryCandidatesByProjectId(restoredState.projectMemoryCandidatesByProjectId);
          setSelectedProjectId(restoredState.selectedProjectId);
          setSelectedSessionId(restoredState.selectedSessionId);
          setSidebarCollapsed(restoredState.sidebarCollapsed);
        }
      } catch (error) {
        console.warn("Failed to load persisted studio state.", error);
      } finally {
        if (!cancelled) {
          setDidHydratePersistedState(true);
        }
      }
    };

    void hydratePersistedState();

    return () => {
      cancelled = true;
    };
  }, []);

  const appendEvent = useCallback((event: TimelineEventInput) => {
    setTimelineEvents((current) => [...current, { id: crypto.randomUUID(), ...event } as TimelineEvent]);
  }, []);

  const updateSessionMetadata = useCallback((sessionId: string, updatedAt: string, draftTitle?: string) => {
    setSessions((current) =>
      current.map((session) => {
        if (session.id !== sessionId) {
          return session;
        }
        return {
          ...session,
          updatedAt,
          title: draftTitle && session.title.startsWith("Session ") ? draftTitle : session.title,
        };
      }),
    );
  }, []);

  const refreshHealth = useCallback(async () => {
    try {
      const response = await getHealth();
      setHealth(toHealthyState(response));
    } catch (error) {
      const label =
        error instanceof ApiClientError
          ? `Disconnected (${error.status})`
          : "Disconnected";
      setHealth({
        connected: false,
        label,
        tone: "danger",
      });
    }
  }, []);

  useEffect(() => {
    void refreshHealth();
    const intervalId = window.setInterval(() => {
      void refreshHealth();
    }, HEALTH_POLL_MS);
    return () => window.clearInterval(intervalId);
  }, [refreshHealth]);

  useEffect(() => {
    void getSettings()
      .then(setBackendSettings)
      .catch((error) => {
        console.warn("Failed to fetch backend settings.", error);
      });
  }, []);

  useEffect(() => {
    if (!didHydratePersistedState) {
      return;
    }

    if (saveTimeoutRef.current !== null) {
      window.clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = window.setTimeout(() => {
      void window.clawStudio.saveStudioState(
        toPersistedStudioState({
          locale,
          projects,
          sessions,
          timelineEvents,
          projectMemoryByProjectId,
          projectMemoryCandidatesByProjectId,
          selectedProjectId,
          selectedSessionId,
          sidebarCollapsed,
        }),
      ).catch((error) => {
        console.warn("Failed to save studio state.", error);
      });
    }, 500);

    return () => {
      if (saveTimeoutRef.current !== null) {
        window.clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
    };
  }, [
    didHydratePersistedState,
    locale,
    projects,
    projectMemoryCandidatesByProjectId,
    projectMemoryByProjectId,
    selectedProjectId,
    selectedSessionId,
    sessions,
    sidebarCollapsed,
    timelineEvents,
  ]);

  const selectProject = (projectId: string) => {
    setSelectedProjectId(projectId);
    const firstSession = sessions.find((session) => session.projectId === projectId);
    if (firstSession) {
      setSelectedSessionId(firstSession.id);
    }
    setProjectMemoryByProjectId((current) =>
      current[projectId]
        ? current
        : {
            ...current,
            [projectId]: createEmptyProjectMemory(),
          },
    );
    setProjectMemoryCandidatesByProjectId((current) =>
      current[projectId]
        ? current
        : {
            ...current,
            [projectId]: [],
          },
    );
  };

  const selectSession = (sessionId: string) => {
    setSelectedSessionId(sessionId);
  };

  const setSessionPermissionMode = (sessionId: string, permissionMode: PermissionMode) => {
    setSessions((current) =>
      current.map((session) =>
        session.id === sessionId
          ? {
              ...session,
              permissionMode,
            }
          : session,
      ),
    );
  };

  const setSessionAgentRole = (sessionId: string, role: AgentRole) => {
    setSessions((current) =>
      current.map((session) =>
        session.id === sessionId ? { ...session, role } : session,
      ),
    );
  };

  const createSession = () => {
    const now = new Date().toISOString();
    const sessionId = crypto.randomUUID();
    const nextSession: StudioSession = {
      id: sessionId,
      projectId: selectedProjectId,
      title: `Session ${visibleSessions.length + 1}`,
      createdAt: now,
      updatedAt: now,
      permissionMode: currentSession?.permissionMode ?? "default",
    };

    setSessions((current) => [nextSession, ...current]);
    setSelectedSessionId(sessionId);
    appendEvent({
      sessionId,
      type: "system_note",
      createdAt: now,
      text: "New session created. Timeline events from future runs will appear here.",
    });
    setComposerValue("");
  };

  const updateProjectMemory = (projectId: string, nextMemory: Omit<ProjectMemory, "updatedAt">) => {
    setProjectMemoryByProjectId((current) => ({
      ...current,
      [projectId]: {
        summary: nextMemory.summary.trim(),
        rules: nextMemory.rules.map((rule) => rule.trim()).filter(Boolean),
        decisions: nextMemory.decisions.map((decision) => decision.trim()).filter(Boolean),
        currentFocus: nextMemory.currentFocus.map((item) => item.trim()).filter(Boolean),
        updatedAt: new Date().toISOString(),
      },
    }));
  };

  const createProjectMemoryCandidate = ({
    projectId,
    kind,
    content,
    sourceSessionId,
    sourceTimelineEventId,
    createdBy = "user_explicit",
  }: {
    projectId: string;
    kind: ProjectMemoryCandidateKind;
    content: string;
    sourceSessionId?: string;
    sourceTimelineEventId?: string;
    createdBy?: ProjectMemoryCandidateCreatedBy;
  }) => {
    const normalizedContent = normalizeCandidateContent(content);
    if (!normalizedContent) {
      return;
    }

    setProjectMemoryCandidatesByProjectId((current) => ({
      ...current,
      [projectId]: [
        {
          id: crypto.randomUUID(),
          projectId,
          sourceSessionId,
          sourceTimelineEventId,
          kind,
          content: normalizedContent,
          createdAt: new Date().toISOString(),
          createdBy,
          status: "pending" as const,
        },
        ...(current[projectId] ?? []),
      ],
    }));
  };

  const stageProjectMemorySuggestion = (suggestion: ProjectMemorySuggestion) => {
    createProjectMemoryCandidate({
      projectId: suggestion.projectId,
      kind: suggestion.suggestedKind,
      content: suggestion.content,
      sourceSessionId: suggestion.sourceSessionId,
      sourceTimelineEventId: suggestion.sourceTimelineEventId,
      createdBy: "assistant_suggested",
    });
  };

  const acceptProjectMemoryCandidate = (projectId: string, candidateId: string) => {
    const candidateToPromote =
      (projectMemoryCandidatesByProjectId[projectId] ?? []).find((candidate) => candidate.id === candidateId) ??
      null;

    setProjectMemoryCandidatesByProjectId((current) => {
      const nextCandidates: ProjectMemoryCandidate[] = [];

      for (const candidate of current[projectId] ?? []) {
        if (candidate.id !== candidateId) {
          nextCandidates.push(candidate);
          continue;
        }

        if (candidate.kind === "pinned") {
          nextCandidates.push({ ...candidate, status: "accepted" as const });
        }
      }

      return {
        ...current,
        [projectId]: nextCandidates,
      };
    });

    if (!candidateToPromote || candidateToPromote.kind === "pinned") {
      return;
    }

    setProjectMemoryByProjectId((current) => {
      const memory = current[projectId] ?? createEmptyProjectMemory();
      return {
        ...current,
        [projectId]: promoteCandidateIntoMemory(memory, candidateToPromote),
      };
    });
  };

  const dismissProjectMemoryCandidate = (projectId: string, candidateId: string) => {
    setProjectMemoryCandidatesByProjectId((current) => ({
      ...current,
      [projectId]: (current[projectId] ?? []).flatMap((candidate) => {
        if (candidate.id !== candidateId) {
          return [candidate];
        }

        if (candidate.createdBy === "assistant_suggested") {
          return [{ ...candidate, status: "rejected" as const }];
        }

        return [];
      }),
    }));
  };

  const removeProjectMemoryItem = (
    projectId: string,
    section: DurableProjectMemorySection,
    content: string,
  ) => {
    setProjectMemoryByProjectId((current) => {
      const memory = current[projectId] ?? createEmptyProjectMemory();
      return {
        ...current,
        [projectId]: {
          ...memory,
          [section]: memory[section].filter((item) => item !== content),
          updatedAt: new Date().toISOString(),
        },
      };
    });
  };

  const removePinnedProjectMemoryItem = (projectId: string, candidateId: string) => {
    setProjectMemoryCandidatesByProjectId((current) => ({
      ...current,
      [projectId]: (current[projectId] ?? []).filter((candidate) => candidate.id !== candidateId),
    }));

    setProjectMemoryByProjectId((current) => {
      const memory = current[projectId] ?? createEmptyProjectMemory();
      return {
        ...current,
        [projectId]: {
          ...memory,
          updatedAt: new Date().toISOString(),
        },
      };
    });
  };

  const submitComposer = async () => {
    const text = composerValue.trim();
    if (!text || currentRun) {
      return;
    }

    const now = new Date().toISOString();
    const currentEventCount = currentTimeline.length;

    appendEvent({
      sessionId: selectedSessionId,
      type: "user_message",
      createdAt: now,
      text,
    });
    updateSessionMetadata(selectedSessionId, now, currentEventCount <= 1 ? text.slice(0, 32) : undefined);
    setComposerValue("");
    setComposerAttachments([]);

    // Collect durable project memory for injection
    const memory = currentProjectMemory;
    const pinnedItems = projectMemoryCandidatesByProjectId[selectedProjectId]?.filter(
      (candidate) => candidate.kind === "pinned" && candidate.status === "accepted"
    ) ?? [];

    const projectMemoryPayload = {
      rules: memory.rules.length > 0 ? memory.rules : undefined,
      decisions: memory.decisions.length > 0 ? memory.decisions : undefined,
      currentFocus: memory.currentFocus.length > 0 ? memory.currentFocus : undefined,
      pinnedItems: pinnedItems.length > 0 ? pinnedItems.map((item) => item.content) : undefined,
    };

    try {
      const created = await startRun({
        prompt: text,
        permissionMode: currentSession?.permissionMode ?? "default",
        role: currentSession?.role ?? "default",
        attachments: composerAttachments.length > 0 ? composerAttachments : undefined,
        projectMemory: Object.values(projectMemoryPayload).some((v) => v !== undefined) ? projectMemoryPayload : undefined,
      });
      appendEvent({
        sessionId: selectedSessionId,
        type: "run_started",
        createdAt: new Date().toISOString(),
        runId: created.id,
      });

      setActiveRuns((current) => ({
        ...current,
        [selectedSessionId]: {
          sessionId: selectedSessionId,
          runId: created.id,
          lastStatus: created.status,
          seenLogCount: 0,
          finalOutputEmitted: false,
        },
      }));
    } catch (error) {
      appendEvent({
        sessionId: selectedSessionId,
        type: "error",
        createdAt: new Date().toISOString(),
        message: error instanceof Error ? error.message : "Failed to start run",
      });
    }
  };

  const requestStop = async () => {
    if (!currentRun) {
      return;
    }
    try {
      await stopRun(currentRun.runId);
    } catch (error) {
      appendEvent({
        sessionId: selectedSessionId,
        type: "error",
        createdAt: new Date().toISOString(),
        runId: currentRun.runId,
        message: error instanceof Error ? error.message : "Failed to stop run",
      });
    }
  };

  useEffect(() => {
    const trackers = Object.values(activeRuns);
    if (trackers.length === 0) {
      return;
    }

    let cancelled = false;

    const tick = async () => {
      const nextTrackers: Record<string, ActiveRunTracker> = {};

      await Promise.all(
        trackers.map(async (tracker) => {
          try {
            const [statusResponse, logsResponse] = await Promise.all([
              getRunStatus(tracker.runId),
              getRunLogs(tracker.runId),
            ]);

            if (cancelled) {
              return;
            }

            const sessionId = tracker.sessionId;
            const newLogs = logsResponse.logs.slice(tracker.seenLogCount);
            for (const log of newLogs) {
              const normalizedText = normalizeTerminalText(log.message);
              if (!normalizedText) {
                continue;
              }

              appendEvent({
                sessionId,
                runId: tracker.runId,
                createdAt: log.ts,
                type:
                  log.stream === "stdout"
                    ? "log_stdout"
                    : log.stream === "stderr"
                      ? classifyStderrLine(normalizedText) === "meta"
                        ? "log_stderr_meta"
                        : "log_stderr"
                      : "log_system",
                text: normalizedText,
              });
            }

            const shouldEmitStatus =
              statusResponse.status !== tracker.lastStatus &&
              statusResponse.status !== "idle" &&
              statusResponse.status !== "starting";
            if (shouldEmitStatus) {
              const runStatus = statusResponse.status as Extract<
                TimelineEvent,
                { type: "run_status" }
              >["status"];
              appendEvent({
                sessionId,
                runId: tracker.runId,
                createdAt: statusResponse.finishedAt ?? new Date().toISOString(),
                type: "run_status",
                status: runStatus,
              });
            }

            const nextTracker = handleTerminalArtifacts(
              tracker,
              statusResponse,
              sessionId,
              appendEvent,
            );

            if (!isTerminalStatus(statusResponse.status)) {
              nextTrackers[sessionId] = {
                ...nextTracker,
                lastStatus: statusResponse.status,
                seenLogCount: logsResponse.logs.length,
              };
            }

            updateSessionMetadata(sessionId, statusResponse.finishedAt ?? new Date().toISOString());
          } catch (error) {
            if (cancelled) {
              return;
            }
            appendEvent({
              sessionId: tracker.sessionId,
              type: "error",
              createdAt: new Date().toISOString(),
              runId: tracker.runId,
              message: error instanceof Error ? error.message : "Failed to poll run",
            });
          }
        }),
      );

      if (!cancelled) {
        setActiveRuns(nextTrackers);
      }
    };

    void tick();
    const intervalId = window.setInterval(() => {
      void tick();
    }, RUN_POLL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [activeRuns, appendEvent, updateSessionMetadata]);

  const addComposerAttachment = (attachment: { id: string; data: string; mimeType: string }) => {
    setComposerAttachments((current) => [...current, attachment]);
  };

  const removeComposerAttachment = (attachmentId: string) => {
    setComposerAttachments((current) => current.filter((att) => att.id !== attachmentId));
  };

  const saveModelSelection = useCallback(
    async (provider: string, model: string): Promise<void> => {
      if (!backendSettings) {
        throw new Error("Settings not yet loaded");
      }
      const next: AppSettings = { ...backendSettings, activeProvider: provider, activeModel: model };
      const saved = await saveSettings(next);
      setBackendSettings(saved);
    },
    [backendSettings],
  );

  return {
    backendHealth: health,
    backendSettings,
    canStop: Boolean(canStop),
    composerValue,
    composerAttachments,
    currentAgentRole: (currentSession?.role ?? "default") as AgentRole,
    currentPermissionMode: currentSession?.permissionMode ?? "default",
    currentProjectMemory,
    currentProjectMemoryCandidates,
    currentProjectMemorySuggestions,
    currentRunId: currentRun?.runId ?? null,
    currentTimeline,
    locale,
    projects,
    selectedProjectId,
    selectedSessionId,
    setLocale,
    setSessionPermissionMode,
    sidebarCollapsed,
    sessions: visibleSessions,
    acceptProjectMemoryCandidate,
    addComposerAttachment,
    createSession,
    createProjectMemoryCandidate,
    dismissProjectMemoryCandidate,
    removePinnedProjectMemoryItem,
    removeProjectMemoryItem,
    removeComposerAttachment,
    requestStop,
    saveModelSelection,
    selectProject,
    setSessionAgentRole,
    selectSession,
    setSidebarCollapsed,
    setComposerValue,
    submitComposer,
    stageProjectMemorySuggestion,
    updateProjectMemory,
  };
}

function handleTerminalArtifacts(
  tracker: ActiveRunTracker,
  statusResponse: RunStatusResponse,
  sessionId: string,
  appendEvent: (event: TimelineEventInput) => void,
): ActiveRunTracker {
  let nextTracker = { ...tracker, lastStatus: statusResponse.status };

  if (statusResponse.status === "failed" && statusResponse.errorMessage && tracker.emittedErrorMessage !== statusResponse.errorMessage) {
    appendEvent({
      sessionId,
      createdAt: statusResponse.finishedAt ?? new Date().toISOString(),
      runId: tracker.runId,
      type: "error",
      message: statusResponse.errorMessage,
    });
    nextTracker = {
      ...nextTracker,
      emittedErrorMessage: statusResponse.errorMessage,
    };
  }

  if (statusResponse.status === "completed" && statusResponse.finalOutput && !tracker.finalOutputEmitted) {
    appendEvent({
      sessionId,
      createdAt: statusResponse.finishedAt ?? new Date().toISOString(),
      runId: tracker.runId,
      type: "final_output",
      text: normalizeTerminalText(statusResponse.finalOutput),
    });
    nextTracker = {
      ...nextTracker,
      finalOutputEmitted: true,
    };
  }

  return nextTracker;
}

function isTerminalStatus(status: RunStatus): boolean {
  return status === "completed" || status === "failed" || status === "stopped";
}

function toHealthyState(response: LocalApiHealth): HealthState {
  return {
    connected: response.ok,
    label: response.ok ? "Connected" : "Disconnected",
    tone: response.ok ? "success" : "danger",
    lastCheckedAt: response.ts,
  };
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

function normalizeCandidateContent(value: string): string {
  return value
    .trim()
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n");
}

function promoteCandidateIntoMemory(
  memory: ProjectMemory,
  candidate: ProjectMemoryCandidate,
): ProjectMemory {
  const content = candidate.content.trim();
  const updatedAt = new Date().toISOString();

  switch (candidate.kind) {
    case "rule":
      return {
        ...memory,
        rules: appendUniqueItem(memory.rules, content),
        updatedAt,
      };
    case "decision":
      return {
        ...memory,
        decisions: appendUniqueItem(memory.decisions, content),
        updatedAt,
      };
    case "current_focus":
      return {
        ...memory,
        currentFocus: appendUniqueItem(memory.currentFocus, content),
        updatedAt,
      };
    case "pinned":
      return {
        ...memory,
        updatedAt,
      };
  }
}

function appendUniqueItem(items: string[], nextItem: string): string[] {
  return items.includes(nextItem) ? items : [...items, nextItem];
}

function normalizeForDedup(content: string): string {
  return content
    .trim()
    .toLowerCase()
    .replace(/[ \t]+/g, " ")
    .replace(/^[-*•]\s*/, "")
    .replace(/^(decision|rule|next|note|focus)\s*:\s*/i, "")
    .replace(/[.!?。．！？]+$/, "")
    .trim();
}

function buildExistingCandidateKeySet({
  candidates,
  memory,
}: {
  candidates: ProjectMemoryCandidate[];
  memory: ProjectMemory;
}): Set<string> {
  const keys = new Set<string>();

  // Durable memory — already accepted into truth
  for (const item of memory.rules) {
    keys.add(`rule:${normalizeForDedup(item)}`);
  }
  for (const item of memory.decisions) {
    keys.add(`decision:${normalizeForDedup(item)}`);
  }
  for (const item of memory.currentFocus) {
    keys.add(`current_focus:${normalizeForDedup(item)}`);
  }

  // Pending review items — visible in the review queue, not yet accepted or rejected
  for (const candidate of candidates) {
    if (candidate.status !== "pending" || candidate.kind === "pinned") {
      continue;
    }
    keys.add(`${candidate.kind}:${normalizeForDedup(candidate.content)}`);
  }

  return keys;
}

function detectProjectMemorySuggestions({
  candidates,
  memory,
  projectId,
  timelineEvents,
}: {
  candidates: ProjectMemoryCandidate[];
  memory: ProjectMemory;
  projectId: string;
  timelineEvents: TimelineEvent[];
}): ProjectMemorySuggestion[] {
  const suggestions: ProjectMemorySuggestion[] = [];
  // seenKeys starts with durable memory + pending candidates,
  // then grows as suggestions are added — covering same-session duplicates too.
  const seenKeys = buildExistingCandidateKeySet({ candidates, memory });

  for (const event of timelineEvents) {
    if (event.type !== "assistant_message" && event.type !== "final_output") {
      continue;
    }

    const matches = detectSuggestionMatches(event.text);
    for (const match of matches) {
      const normalized = normalizeForDedup(match.content);
      if (!normalized || normalized.length < 8) {
        continue;
      }

      const key = `${match.kind}:${normalized}`;
      if (seenKeys.has(key)) {
        continue;
      }

      seenKeys.add(key);
      suggestions.push({
        id: `${event.id}-${match.kind}`,
        projectId,
        sourceSessionId: event.sessionId,
        sourceTimelineEventId: event.id,
        suggestedKind: match.kind,
        content: match.content,
        createdAt: event.createdAt,
      });
    }
  }

  return suggestions;
}

function detectSuggestionMatches(
  text: string,
): Array<{ kind: ProjectMemorySuggestionKind; content: string }> {
  const detectors: Array<{
    kind: ProjectMemorySuggestionKind;
    patterns: RegExp[];
  }> = [
    {
      kind: "rule",
      patterns: [
        /\bmust\b/i,
        /\bshould\b/i,
        /\bdo not\b/i,
        /\bkeep\b/i,
        /\bnever\b/i,
        /必ず/,
        /してはいけない/,
        /しないこと/,
        /保つ/,
        /維持/,
      ],
    },
    {
      kind: "decision",
      patterns: [
        /\bdecision\b/i,
        /\bdecided\b/i,
        /\bwe will\b/i,
        /\bwe chose\b/i,
        /決定/,
        /決めた/,
        /方針/,
        /採用/,
      ],
    },
    {
      kind: "current_focus",
      patterns: [
        /\bcurrent focus\b/i,
        /\bnext\b/i,
        /\bpriority\b/i,
        /\bfocus\b/i,
        /\bnext step\b/i,
        /次/,
        /優先/,
        /焦点/,
        /次の一手/,
      ],
    },
  ];

  return detectors
    .map((detector) => {
      const content = findSuggestedExcerpt(text, detector.patterns);
      return content ? { kind: detector.kind, content } : null;
    })
    .filter((match): match is { kind: ProjectMemorySuggestionKind; content: string } => Boolean(match));
}

function findSuggestedExcerpt(text: string, patterns: RegExp[]): string | null {
  const normalizedText = normalizeCandidateContent(text);
  if (!normalizedText || normalizedText.length < 24) {
    return null;
  }

  const segments = normalizedText
    .split(/\n+/)
    .flatMap((line) => line.split(/(?<=[.!?。！？])\s+/))
    .map((segment) => segment.trim())
    .filter(Boolean);

  for (const segment of segments) {
    if (patterns.some((pattern) => pattern.test(segment))) {
      return segment;
    }
  }

  return null;
}


