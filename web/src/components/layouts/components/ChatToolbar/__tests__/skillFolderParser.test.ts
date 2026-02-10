import { describe, expect, it } from "vitest";

import {
  MAX_SKILL_RESOURCE_FILE_BYTES,
  MAX_SKILL_RESOURCE_FILES,
  buildSkillCreateRequest,
  normalizeSkillRelativePath,
  parseSkillFolderFiles,
} from "../skillFolderParser";

function withRelativePath(
  file: File,
  relativePath: string,
  options?: { redefine?: boolean },
): File {
  Object.defineProperty(file, "webkitRelativePath", {
    value: relativePath,
    configurable: options?.redefine ?? false,
  });
  return file;
}

describe("skillFolderParser", () => {
  it("normalizes relative paths by stripping root folder", () => {
    expect(normalizeSkillRelativePath("my-skill/scripts/run.py")).toBe(
      "scripts/run.py",
    );
    expect(normalizeSkillRelativePath("my-skill\\scripts\\run.py")).toBe(
      "scripts/run.py",
    );
  });

  it("rejects illegal path segments", () => {
    expect(() =>
      normalizeSkillRelativePath("my-skill/scripts/../secrets.txt"),
    ).toThrow("invalid segments");
    expect(() => normalizeSkillRelativePath("/my-skill/SKILL.md")).toThrow(
      "must be relative",
    );
  });

  it("parses folder with root SKILL.md and resources", async () => {
    const skillMd = withRelativePath(
      new File(
        [
          "---\nname: demo-skill\ndescription: Demo description\n---\n# Instructions",
        ],
        "SKILL.md",
        { type: "text/markdown" },
      ),
      "demo-skill/SKILL.md",
    );

    const script = withRelativePath(
      new File(["print('hello')"], "run.py", { type: "text/plain" }),
      "demo-skill/scripts/run.py",
    );

    const result = await parseSkillFolderFiles([skillMd, script]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.payload.skill_md).toContain("name: demo-skill");
    expect(result.payload.resources).toEqual([
      { path: "scripts/run.py", content: "print('hello')" },
    ]);
  });

  it("supports nested skill root when uploading a parent folder", async () => {
    const skillMd = withRelativePath(
      new File(["---\nname: demo\ndescription: Demo\n---\nbody"], "SKILL.md", {
        type: "text/markdown",
      }),
      "project/docs/SKILL.md",
    );

    const resource = withRelativePath(
      new File(["print(1)"], "run.py", { type: "text/plain" }),
      "project/docs/scripts/run.py",
    );

    const unrelated = withRelativePath(
      new File(["ignore"], "README.md", { type: "text/plain" }),
      "project/README.md",
    );

    const result = await parseSkillFolderFiles([skillMd, resource, unrelated]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.payload.resources).toEqual([
      { path: "scripts/run.py", content: "print(1)" },
    ]);
  });

  it("rejects when root SKILL.md is missing", async () => {
    const onlyResource = withRelativePath(
      new File(["print(1)"], "run.py", { type: "text/plain" }),
      "demo-skill/scripts/run.py",
    );

    const result = await parseSkillFolderFiles([onlyResource]);

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.errors).toContain("Missing SKILL.md at folder root");
  });

  it("rejects duplicate normalized paths", async () => {
    const skillMd = withRelativePath(
      new File(["---\nname: x\ndescription: y\n---\nbody"], "SKILL.md", {
        type: "text/markdown",
      }),
      "demo-skill/SKILL.md",
    );

    const duplicateA = withRelativePath(
      new File(["a"], "a.py", { type: "text/plain" }),
      "demo-skill/scripts/a.py",
      { redefine: true },
    );
    const duplicateB = withRelativePath(
      new File(["b"], "a.py", { type: "text/plain" }),
      "demo-skill\\scripts\\a.py",
      { redefine: true },
    );

    const result = await parseSkillFolderFiles([
      skillMd,
      duplicateA,
      duplicateB,
    ]);

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(
      result.errors.some((error) => error.includes("duplicate file path")),
    ).toBe(true);
  });

  it("rejects non-text resources", async () => {
    const skillMd = withRelativePath(
      new File(["---\nname: ok\ndescription: ok\n---\nbody"], "SKILL.md", {
        type: "text/markdown",
      }),
      "demo-skill/SKILL.md",
    );

    const binary = withRelativePath(
      new File([new Uint8Array([0, 159, 146, 150])], "data.bin", {
        type: "application/octet-stream",
      }),
      "demo-skill/assets/data.bin",
    );

    const result = await parseSkillFolderFiles([skillMd, binary]);

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(
      result.errors.some((error) =>
        error.includes("not readable as UTF-8 text"),
      ),
    ).toBe(true);
  });

  it("accepts uncommon text file extensions", async () => {
    const skillMd = withRelativePath(
      new File(["---\nname: ok\ndescription: ok\n---\nbody"], "SKILL.md", {
        type: "text/markdown",
      }),
      "demo-skill/SKILL.md",
    );

    const uncommonResource = withRelativePath(
      new File(["CONFIG=1"], "settings.customext", {
        type: "application/octet-stream",
      }),
      "demo-skill/resources/settings.customext",
    );

    const result = await parseSkillFolderFiles([skillMd, uncommonResource]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.payload.resources).toEqual([
      { path: "resources/settings.customext", content: "CONFIG=1" },
    ]);
  });

  it("ignores common system junk files", async () => {
    const skillMd = withRelativePath(
      new File(["---\nname: ok\ndescription: ok\n---\nbody"], "SKILL.md", {
        type: "text/markdown",
      }),
      "demo-skill/SKILL.md",
    );

    const resource = withRelativePath(
      new File(["CONFIG=1"], "settings.customext", {
        type: "text/plain",
      }),
      "demo-skill/resources/settings.customext",
    );

    const dsStore = withRelativePath(
      new File([new Uint8Array([0, 1, 2, 3])], ".DS_Store", {
        type: "application/octet-stream",
      }),
      "demo-skill/.DS_Store",
      { redefine: true },
    );

    const result = await parseSkillFolderFiles([skillMd, resource, dsStore]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.payload.resources).toEqual([
      { path: "resources/settings.customext", content: "CONFIG=1" },
    ]);
  });

  it("rejects resource files over per-file size limit", async () => {
    const skillMd = withRelativePath(
      new File(["---\nname: ok\ndescription: ok\n---\nbody"], "SKILL.md", {
        type: "text/markdown",
      }),
      "demo-skill/SKILL.md",
    );

    const oversized = withRelativePath(
      new File(["a".repeat(MAX_SKILL_RESOURCE_FILE_BYTES + 1)], "big.txt", {
        type: "text/plain",
      }),
      "demo-skill/resources/big.txt",
    );

    const result = await parseSkillFolderFiles([skillMd, oversized]);

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(
      result.errors.some((error) => error.includes("file exceeds max size")),
    ).toBe(true);
  });

  it("rejects resource file count over limit", async () => {
    const skillMd = withRelativePath(
      new File(["---\nname: ok\ndescription: ok\n---\nbody"], "SKILL.md", {
        type: "text/markdown",
      }),
      "demo-skill/SKILL.md",
    );

    const manyResources = Array.from(
      { length: MAX_SKILL_RESOURCE_FILES + 1 },
      (_, index) =>
        withRelativePath(
          new File(["x"], `${index}.txt`, { type: "text/plain" }),
          `demo-skill/resources/${index}.txt`,
          { redefine: true },
        ),
    );

    const result = await parseSkillFolderFiles([skillMd, ...manyResources]);

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(
      result.errors.some((error) => error.includes("Too many resource files")),
    ).toBe(true);
  });

  it("builds create request payload", () => {
    const payload = buildSkillCreateRequest(
      {
        name: "",
        description: "",
        skill_md: "---\nname: demo\ndescription: Demo\n---\nbody",
        resources: [{ path: "scripts/run.py", content: "print(1)" }],
      },
      "demo",
      "Demo",
    );

    expect(payload).toMatchObject({
      name: "demo",
      description: "Demo",
      resources: [{ path: "scripts/run.py", content: "print(1)" }],
      compatibility: null,
      license: null,
      metadata_json: null,
    });
  });
});
