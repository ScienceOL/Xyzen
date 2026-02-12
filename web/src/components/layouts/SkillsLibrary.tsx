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
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
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

function fileIcon(fileName: string): ReactNode {
  const kind = fileKindLabel(fileName);

  switch (kind) {
    case "core":
      return <SparklesIcon className="h-3.5 w-3.5 text-emerald-500" />;
    case "md":
      return <DocumentTextIcon className="h-3.5 w-3.5 text-blue-400" />;
    case "code":
      return <CodeBracketIcon className="h-3.5 w-3.5 text-blue-500" />;
    case "json":
      return <DocumentTextIcon className="h-3.5 w-3.5 text-yellow-500" />;
    case "config":
      return <DocumentTextIcon className="h-3.5 w-3.5 text-violet-400" />;
    case "table":
      return <TableCellsIcon className="h-3.5 w-3.5 text-green-500" />;
    case "image":
      return <PhotoIcon className="h-3.5 w-3.5 text-purple-400" />;
    case "audio":
      return <MusicalNoteIcon className="h-3.5 w-3.5 text-pink-400" />;
    case "video":
      return <FilmIcon className="h-3.5 w-3.5 text-orange-400" />;
    case "archive":
      return <ArchiveBoxIcon className="h-3.5 w-3.5 text-stone-400" />;
    case "text":
      return <DocumentTextIcon className="h-3.5 w-3.5 text-neutral-400" />;
    default:
      return <DocumentTextIcon className="h-3.5 w-3.5 text-neutral-400" />;
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
      for (const value of collectExpandedValuesForSkill(
        skill.id,
        resourcePaths,
      )) {
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
    <div className="h-full w-full bg-white dark:bg-neutral-950 flex flex-col">
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
            className="w-full"
          >
            <FolderItem value="builtin-root">
              <FolderTrigger
                icon={<FolderIcon className="h-3.5 w-3.5 text-fuchsia-500" />}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium">
                    {t("app.skillsPanel.builtinFolder", "builtin")}
                  </span>
                  <span className="rounded-full bg-neutral-100 px-1.5 py-0.5 text-[10px] text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
                    {builtinSkills.length}
                  </span>
                </div>
              </FolderTrigger>
              <FolderContent>
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
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium">
                    {t("app.skillsPanel.userFolder", "my-skills")}
                  </span>
                  <span className="rounded-full bg-neutral-100 px-1.5 py-0.5 text-[10px] text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
                    {userSkills.length}
                  </span>
                </div>
              </FolderTrigger>
              <FolderContent>
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
  const tree = useMemo(
    () => buildSkillFileTree(resourcePaths),
    [resourcePaths],
  );
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
              skill.scope === "builtin" ? "text-fuchsia-500" : "text-sky-500",
            )}
          />
        }
      >
        <span className="truncate">{skill.name}</span>
      </FolderTrigger>
      <FolderContent>
        {renderTreeNode({
          node: tree,
          keyPrefix: `skill:${skill.id}`,
          depth: 0,
        })}

        <FileItem
          icon={<UserCircleIcon className="h-3.5 w-3.5 text-neutral-400" />}
          className="text-neutral-500 dark:text-neutral-400"
        >
          {sourceLabel}
        </FileItem>
        <FileItem icon={<ClockIcon className="h-3.5 w-3.5 text-neutral-400" />}>
          <span className="text-neutral-500 dark:text-neutral-400">
            {t("app.skillsPanel.updatedAt", "Updated")}:{" "}
            {new Date(skill.updated_at).toLocaleString()}
          </span>
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
          icon={
            <FolderIcon className="h-3.5 w-3.5 text-neutral-500 dark:text-neutral-400" />
          }
        >
          <span className="truncate">{folderName}</span>
        </FolderTrigger>
        <FolderContent>
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
    const icon = fileIcon(fileName);
    elements.push(
      <FileItem key={fileKey} icon={icon}>
        <span className="truncate">{fileName}</span>
        <span className="ml-auto rounded-full bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
          {fileBadgeText(fileName)}
        </span>
      </FileItem>,
    );
  }

  return elements;
}
