import { CreateSkillModal } from "@/components/layouts/components/ChatToolbar/CreateSkillModal";
import { Button } from "@/components/ui/button";
import { useXyzen } from "@/store";
import { skillService } from "@/service/skillService";
import type { SkillRead } from "@/types/skills";
import {
  Files,
  FileItem,
  FolderContent,
  FolderItem,
  FolderTrigger,
} from "@/components/animate-ui/components/radix/files";
import {
  ArrowPathIcon,
  ArchiveBoxIcon,
  CodeBracketIcon,
  DocumentTextIcon,
  ExclamationTriangleIcon,
  FilmIcon,
  ClockIcon,
  MusicalNoteIcon,
  PhotoIcon,
  SparklesIcon,
  TableCellsIcon,
  UserCircleIcon,
} from "@heroicons/react/24/outline";
import { FolderIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "Unknown error";
}

function sortSkills(skills: SkillRead[]): SkillRead[] {
  return [...skills].sort((a, b) => a.name.localeCompare(b.name));
}

interface FileTreeNode {
  folders: Map<string, FileTreeNode>;
  files: Set<string>;
}

function createFileTreeNode(): FileTreeNode {
  return {
    folders: new Map<string, FileTreeNode>(),
    files: new Set<string>(),
  };
}

function normalizeRelativePath(path: string): string | null {
  const normalized = path.trim().replace(/\\/g, "/");
  if (!normalized) return null;
  if (normalized.startsWith("/")) return null;

  const parts = normalized.split("/").filter(Boolean);
  if (
    parts.length === 0 ||
    parts.some((part) => part === "." || part === ".." || part.length === 0)
  ) {
    return null;
  }

  return parts.join("/");
}

function addPathToTree(root: FileTreeNode, path: string): void {
  const normalized = normalizeRelativePath(path);
  if (!normalized) return;

  const parts = normalized.split("/");
  let node = root;
  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i];
    const isLast = i === parts.length - 1;
    if (isLast) {
      node.files.add(part);
      continue;
    }

    const existing = node.folders.get(part);
    if (existing) {
      node = existing;
      continue;
    }
    const next = createFileTreeNode();
    node.folders.set(part, next);
    node = next;
  }
}

function buildSkillFileTree(resourcePaths: string[]): FileTreeNode {
  const root = createFileTreeNode();
  const allPaths = new Set<string>(["SKILL.md", ...resourcePaths]);
  for (const path of allPaths) {
    addPathToTree(root, path);
  }
  return root;
}

function fileKindLabel(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (lower === "skill.md") return "core";
  if (lower.endsWith(".md")) return "md";
  if (lower.endsWith(".json")) return "json";
  if (
    lower.endsWith(".yaml") ||
    lower.endsWith(".yml") ||
    lower.endsWith(".toml")
  ) {
    return "config";
  }
  if (
    lower.endsWith(".csv") ||
    lower.endsWith(".tsv") ||
    lower.endsWith(".xlsx")
  ) {
    return "table";
  }
  if (
    lower.endsWith(".png") ||
    lower.endsWith(".jpg") ||
    lower.endsWith(".jpeg") ||
    lower.endsWith(".gif") ||
    lower.endsWith(".svg") ||
    lower.endsWith(".webp")
  ) {
    return "image";
  }
  if (
    lower.endsWith(".mp3") ||
    lower.endsWith(".wav") ||
    lower.endsWith(".ogg")
  ) {
    return "audio";
  }
  if (
    lower.endsWith(".mp4") ||
    lower.endsWith(".mov") ||
    lower.endsWith(".avi") ||
    lower.endsWith(".mkv")
  ) {
    return "video";
  }
  if (
    lower.endsWith(".zip") ||
    lower.endsWith(".tar") ||
    lower.endsWith(".gz")
  ) {
    return "archive";
  }
  if (
    lower.endsWith(".py") ||
    lower.endsWith(".ts") ||
    lower.endsWith(".tsx") ||
    lower.endsWith(".js") ||
    lower.endsWith(".jsx")
  ) {
    return "code";
  }
  if (lower.endsWith(".txt")) return "text";
  return "file";
}

function fileVisualStyle(fileName: string): {
  rowClass: string;
  badgeClass: string;
  icon: ReactNode;
} {
  const kind = fileKindLabel(fileName);

  switch (kind) {
    case "core":
      return {
        rowClass:
          "border border-emerald-200/80 bg-emerald-50 text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-200",
        badgeClass:
          "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
        icon: <SparklesIcon className="h-3.5 w-3.5 text-emerald-500" />,
      };
    case "md":
      return {
        rowClass:
          "bg-green-50/70 text-green-800 dark:bg-green-950/20 dark:text-green-200",
        badgeClass:
          "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
        icon: <DocumentTextIcon className="h-3.5 w-3.5 text-green-500" />,
      };
    case "code":
      return {
        rowClass:
          "bg-indigo-50/70 text-indigo-800 dark:bg-indigo-950/20 dark:text-indigo-200",
        badgeClass:
          "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300",
        icon: <CodeBracketIcon className="h-3.5 w-3.5 text-indigo-500" />,
      };
    case "json":
    case "config":
      return {
        rowClass:
          "bg-amber-50/70 text-amber-800 dark:bg-amber-950/20 dark:text-amber-200",
        badgeClass:
          "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
        icon: <DocumentTextIcon className="h-3.5 w-3.5 text-amber-500" />,
      };
    case "table":
      return {
        rowClass:
          "bg-cyan-50/70 text-cyan-800 dark:bg-cyan-950/20 dark:text-cyan-200",
        badgeClass:
          "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300",
        icon: <TableCellsIcon className="h-3.5 w-3.5 text-cyan-500" />,
      };
    case "image":
      return {
        rowClass:
          "bg-pink-50/70 text-pink-800 dark:bg-pink-950/20 dark:text-pink-200",
        badgeClass:
          "bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300",
        icon: <PhotoIcon className="h-3.5 w-3.5 text-pink-500" />,
      };
    case "audio":
      return {
        rowClass:
          "bg-purple-50/70 text-purple-800 dark:bg-purple-950/20 dark:text-purple-200",
        badgeClass:
          "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
        icon: <MusicalNoteIcon className="h-3.5 w-3.5 text-purple-500" />,
      };
    case "video":
      return {
        rowClass:
          "bg-orange-50/70 text-orange-800 dark:bg-orange-950/20 dark:text-orange-200",
        badgeClass:
          "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
        icon: <FilmIcon className="h-3.5 w-3.5 text-orange-500" />,
      };
    case "archive":
      return {
        rowClass:
          "bg-stone-50/70 text-stone-800 dark:bg-stone-900/30 dark:text-stone-200",
        badgeClass:
          "bg-stone-200 text-stone-700 dark:bg-stone-800 dark:text-stone-300",
        icon: <ArchiveBoxIcon className="h-3.5 w-3.5 text-stone-500" />,
      };
    case "text":
      return {
        rowClass:
          "bg-sky-50/70 text-sky-800 dark:bg-sky-950/20 dark:text-sky-200",
        badgeClass:
          "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
        icon: <DocumentTextIcon className="h-3.5 w-3.5 text-sky-500" />,
      };
    default:
      return {
        rowClass:
          "bg-neutral-50/80 text-neutral-800 dark:bg-neutral-900/30 dark:text-neutral-200",
        badgeClass:
          "bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300",
        icon: <DocumentTextIcon className="h-3.5 w-3.5 text-neutral-500" />,
      };
  }
}

function fileBadgeText(fileName: string): string {
  const kind = fileKindLabel(fileName);
  if (kind === "core") return "CORE";

  const ext = fileName.split(".").pop()?.trim().toUpperCase();
  if (ext && ext.length <= 6) {
    return ext;
  }
  return kind.toUpperCase();
}

function countFiles(node: FileTreeNode): number {
  let total = node.files.size;
  for (const child of node.folders.values()) {
    total += countFiles(child);
  }
  return total;
}

function countFolders(node: FileTreeNode): number {
  let total = node.folders.size;
  for (const child of node.folders.values()) {
    total += countFolders(child);
  }
  return total;
}

function collectExpandedValuesForSkill(
  skillId: string,
  resourcePaths: string[],
): string[] {
  const values = new Set<string>([`skill:${skillId}`]);
  const allPaths = ["SKILL.md", ...resourcePaths];

  for (const rawPath of allPaths) {
    const normalized = normalizeRelativePath(rawPath);
    if (!normalized) continue;
    const parts = normalized.split("/");
    if (parts.length <= 1) continue;

    let folderValue = `skill:${skillId}`;
    for (let index = 0; index < parts.length - 1; index += 1) {
      folderValue = `${folderValue}/${parts[index]}`;
      values.add(folderValue);
    }
  }

  return Array.from(values);
}

export default function SkillsLibrary() {
  const { t } = useTranslation();
  const activeAgentId = useXyzen((state) => {
    const activeChannelId = state.activeChatChannel;
    if (!activeChannelId) return null;
    return state.channels[activeChannelId]?.agentId ?? null;
  });

  const [skills, setSkills] = useState<SkillRead[]>([]);
  const [resourcePathsBySkill, setResourcePathsBySkill] = useState<
    Record<string, string[]>
  >({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  const builtinSkills = useMemo(
    () => sortSkills(skills.filter((skill) => skill.scope === "builtin")),
    [skills],
  );
  const userSkills = useMemo(
    () => sortSkills(skills.filter((skill) => skill.scope === "user")),
    [skills],
  );
  const defaultExpandedValues = useMemo(() => {
    const values = new Set<string>(["builtin-root", "user-root"]);
    for (const skill of skills) {
      const resourcePaths = resourcePathsBySkill[skill.id] ?? [];
      for (const value of collectExpandedValuesForSkill(skill.id, resourcePaths)) {
        values.add(value);
      }
    }
    return Array.from(values);
  }, [resourcePathsBySkill, skills]);

  const loadSkills = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setWarning(null);

    try {
      const listed = await skillService.listSkills();
      setSkills(listed);

      if (listed.length === 0) {
        setResourcePathsBySkill({});
        return;
      }

      const settled = await Promise.allSettled(
        listed.map(async (skill) => {
          const paths = await skillService.listSkillResources(skill.id);
          return [skill.id, paths] as const;
        }),
      );

      const nextMap: Record<string, string[]> = {};
      let failedCount = 0;
      for (const result of settled) {
        if (result.status === "fulfilled") {
          const [skillId, paths] = result.value;
          nextMap[skillId] = paths;
        } else {
          failedCount += 1;
        }
      }

      for (const skill of listed) {
        if (!nextMap[skill.id]) {
          nextMap[skill.id] = [];
        }
      }
      setResourcePathsBySkill(nextMap);

      if (failedCount > 0) {
        setWarning(
          t(
            "app.skillsPanel.partialResourceFailed",
            "Some skill files could not be loaded.",
          ),
        );
      }
    } catch (err) {
      setError(
        toErrorMessage(err) ||
          t("app.skillsPanel.loadFailed", "Failed to load skills"),
      );
      setSkills([]);
      setResourcePathsBySkill({});
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadSkills();
  }, [loadSkills]);

  return (
    <div className="h-full w-full bg-gradient-to-br from-sky-50 via-white to-violet-50 dark:from-neutral-950 dark:via-neutral-950 dark:to-neutral-900 flex flex-col">
      <div className="border-b border-neutral-200/80 dark:border-neutral-800 px-4 py-3 backdrop-blur-sm">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-neutral-900 dark:text-white">
              {t("app.skillsPanel.title", "Skills")}
            </h2>
            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
              {t(
                "app.skillsPanel.subtitle",
                "Browse builtin and user skills as folders.",
              )}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void loadSkills()}
              disabled={isLoading}
              className="h-8 px-2"
            >
              <ArrowPathIcon
                className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
              />
            </Button>
            <Button
              variant="default"
              size="sm"
              className="h-8"
              onClick={() => setIsCreateModalOpen(true)}
            >
              {t("app.skillsPanel.create", "Create Skill")}
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {error && (
          <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
            {error}
          </div>
        )}
        {warning && (
          <div className="mb-3 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300">
            <ExclamationTriangleIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{warning}</span>
          </div>
        )}

        {isLoading ? (
          <div className="text-sm text-neutral-500 dark:text-neutral-400">
            {t("app.skillsPanel.loading", "Loading skills...")}
          </div>
        ) : (
          <Files
            type="multiple"
            defaultValue={defaultExpandedValues}
            className="space-y-1 rounded-lg border border-sky-200/70 bg-white/70 p-2 shadow-sm backdrop-blur-sm dark:border-neutral-800 dark:bg-neutral-900/40"
          >
            <FolderItem value="builtin-root">
              <FolderTrigger
                icon={<FolderIcon className="h-3.5 w-3.5 text-fuchsia-500" />}
                className="bg-gradient-to-r from-fuchsia-50 to-violet-50 dark:from-fuchsia-950/20 dark:to-violet-950/20"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium">
                    {t("app.skillsPanel.builtinFolder", "builtin")}
                  </span>
                  <span className="rounded-full bg-fuchsia-100 px-1.5 py-0.5 text-[10px] text-fuchsia-700 dark:bg-fuchsia-900/30 dark:text-fuchsia-300">
                    {builtinSkills.length}
                  </span>
                </div>
              </FolderTrigger>
              <FolderContent className="space-y-1">
                {builtinSkills.length === 0 && (
                  <div className="px-2 py-1 text-xs text-neutral-500 dark:text-neutral-400">
                    {t(
                      "app.skillsPanel.emptyBuiltin",
                      "No builtin skills available.",
                    )}
                  </div>
                )}
                {builtinSkills.map((skill) => (
                  <SkillFolder
                    key={skill.id}
                    skill={skill}
                    resourcePaths={resourcePathsBySkill[skill.id] ?? []}
                  />
                ))}
              </FolderContent>
            </FolderItem>

            <FolderItem value="user-root">
              <FolderTrigger
                icon={<FolderIcon className="h-3.5 w-3.5 text-sky-500" />}
                className="bg-gradient-to-r from-sky-50 to-cyan-50 dark:from-sky-950/20 dark:to-cyan-950/20"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium">
                    {t("app.skillsPanel.userFolder", "my-skills")}
                  </span>
                  <span className="rounded-full bg-sky-100 px-1.5 py-0.5 text-[10px] text-sky-700 dark:bg-sky-900/30 dark:text-sky-300">
                    {userSkills.length}
                  </span>
                </div>
              </FolderTrigger>
              <FolderContent className="space-y-1">
                {userSkills.length === 0 && (
                  <div className="px-2 py-1 text-xs text-neutral-500 dark:text-neutral-400">
                    {t(
                      "app.skillsPanel.emptyUser",
                      "No user skills created yet.",
                    )}
                  </div>
                )}
                {userSkills.map((skill) => (
                  <SkillFolder
                    key={skill.id}
                    skill={skill}
                    resourcePaths={resourcePathsBySkill[skill.id] ?? []}
                  />
                ))}
              </FolderContent>
            </FolderItem>
          </Files>
        )}
      </div>

      <CreateSkillModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        agentId={activeAgentId}
        onCreated={async () => {
          await loadSkills();
        }}
      />
    </div>
  );
}

function SkillFolder({
  skill,
  resourcePaths,
}: {
  skill: SkillRead;
  resourcePaths: string[];
}) {
  const { t } = useTranslation();
  const tree = useMemo(() => buildSkillFileTree(resourcePaths), [resourcePaths]);
  const fileCount = useMemo(() => countFiles(tree), [tree]);
  const folderCount = useMemo(() => countFolders(tree), [tree]);
  const sourceLabel =
    skill.scope === "builtin"
      ? t("app.skillsPanel.sourceBuiltin", "Source: builtin")
      : t("app.skillsPanel.sourceUser", "Source: user");

  return (
    <FolderItem value={`skill:${skill.id}`}>
      <FolderTrigger
        icon={
          <SparklesIcon
            className={cn(
              "h-3.5 w-3.5",
              skill.scope === "builtin"
                ? "text-fuchsia-500"
                : "text-sky-500",
            )}
          />
        }
        className={cn(
          "border border-transparent",
          skill.scope === "builtin"
            ? "bg-gradient-to-r from-fuchsia-50/80 to-violet-50/80 dark:from-fuchsia-950/15 dark:to-violet-950/15"
            : "bg-gradient-to-r from-sky-50/80 to-cyan-50/80 dark:from-sky-950/15 dark:to-cyan-950/15",
        )}
      >
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-neutral-900 dark:text-neutral-100">
            {skill.name}
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-[11px]">
            <span className="rounded-full bg-violet-100 px-1.5 py-0.5 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300">
              {fileCount} {t("app.skillsPanel.filesLabel", "files")}
            </span>
            <span className="rounded-full bg-indigo-100 px-1.5 py-0.5 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300">
              {folderCount} {t("app.skillsPanel.foldersLabel", "folders")}
            </span>
          </div>
          <div className="mt-1 truncate text-xs text-neutral-500 dark:text-neutral-400">
            {skill.description}
          </div>
        </div>
      </FolderTrigger>
      <FolderContent className="space-y-1">
        {renderTreeNode({
          node: tree,
          keyPrefix: `skill:${skill.id}`,
          depth: 0,
        })}

        <FileItem
          icon={<UserCircleIcon className="h-3.5 w-3.5 text-violet-500" />}
          className="text-violet-700 dark:text-violet-300"
        >
          {sourceLabel}
        </FileItem>
        <FileItem icon={<ClockIcon className="h-3.5 w-3.5" />}>
          {t("app.skillsPanel.updatedAt", "Updated")}:{" "}
          {new Date(skill.updated_at).toLocaleString()}
        </FileItem>
      </FolderContent>
    </FolderItem>
  );
}

function renderTreeNode({
  node,
  keyPrefix,
  depth,
}: {
  node: FileTreeNode;
  keyPrefix: string;
  depth: number;
}): ReactNode[] {
  const elements: ReactNode[] = [];
  const folders = Array.from(node.folders.entries()).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  const files = Array.from(node.files).sort((a, b) => a.localeCompare(b));

  for (const [folderName, childNode] of folders) {
    const folderKey = `${keyPrefix}/${folderName}`;
    elements.push(
      <FolderItem key={folderKey} value={folderKey}>
        <FolderTrigger
          icon={<FolderIcon className="h-3.5 w-3.5 text-indigo-500" />}
          className={cn(
            "text-neutral-800 dark:text-neutral-100",
            depth % 3 === 0 &&
              "bg-indigo-50/60 dark:bg-indigo-950/10 border border-indigo-100/80 dark:border-indigo-900/40",
            depth % 3 === 1 &&
              "bg-cyan-50/60 dark:bg-cyan-950/10 border border-cyan-100/80 dark:border-cyan-900/40",
            depth % 3 === 2 &&
              "bg-fuchsia-50/60 dark:bg-fuchsia-950/10 border border-fuchsia-100/80 dark:border-fuchsia-900/40",
          )}
        >
          <span className="truncate">{folderName}</span>
        </FolderTrigger>
        <FolderContent className="space-y-1">
          {renderTreeNode({
            node: childNode,
            keyPrefix: folderKey,
            depth: depth + 1,
          })}
        </FolderContent>
      </FolderItem>,
    );
  }

  for (const fileName of files) {
    const fileKey = `${keyPrefix}/${fileName}`;
    const visualStyle = fileVisualStyle(fileName);
    elements.push(
      <FileItem
        key={fileKey}
        icon={visualStyle.icon}
        className={cn(
          "font-medium",
          visualStyle.rowClass,
        )}
      >
        <span className="truncate">{fileName}</span>
        <span
          className={cn(
            "ml-auto rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
            visualStyle.badgeClass,
          )}
        >
          {fileBadgeText(fileName)}
        </span>
      </FileItem>,
    );
  }

  return elements;
}
