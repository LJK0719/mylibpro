import fs from "fs";
import path from "path";

export interface SkillDefinition {
    name: string;
    purpose: string;
    whenToUse: string;
    requiredTools: string[];
    prohibitedBehaviors: string[];
    inputSchema: Record<string, unknown>;
    outputSchema: Record<string, unknown>;
    content: string;
}

interface SkillSchemaFile {
    name?: string;
    requiredTools?: string[];
    inputSchema?: Record<string, unknown>;
    outputSchema?: Record<string, unknown>;
}

const SKILLS_ROOT = path.join(process.cwd(), "skills");

function section(content: string, heading: string): string {
    const pattern = new RegExp(
        `^## ${heading}\\s*\\n([\\s\\S]*?)(?=^## |$)`,
        "m"
    );
    return content.match(pattern)?.[1]?.trim() || "";
}

function listItems(markdown: string): string[] {
    return markdown
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.startsWith("- "))
        .map((line) => line.slice(2).trim())
        .filter(Boolean);
}

function readJson(filePath: string): SkillSchemaFile {
    if (!fs.existsSync(filePath)) return {};
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as SkillSchemaFile;
}

export function loadSkill(skillName: string): SkillDefinition {
    const skillDir = path.join(SKILLS_ROOT, skillName);
    const skillPath = path.join(skillDir, "SKILL.md");
    const schemaPath = path.join(skillDir, "schema.json");

    if (!fs.existsSync(skillPath)) {
        throw new Error(`Skill not found: ${skillName}`);
    }

    const content = fs.readFileSync(skillPath, "utf8");
    const schema = readJson(schemaPath);
    const title = content.match(/^#\s+(.+)$/m)?.[1]?.trim();

    return {
        name: schema.name || title || skillName,
        purpose: section(content, "Purpose"),
        whenToUse: section(content, "When To Use"),
        requiredTools:
            schema.requiredTools || listItems(section(content, "Required Tools")),
        prohibitedBehaviors: listItems(section(content, "Must Not")),
        inputSchema: schema.inputSchema || {},
        outputSchema: schema.outputSchema || {},
        content,
    };
}

export function getAllSkills(): SkillDefinition[] {
    if (!fs.existsSync(SKILLS_ROOT)) return [];

    return fs
        .readdirSync(SKILLS_ROOT, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => loadSkill(entry.name))
        .sort((a, b) => a.name.localeCompare(b.name));
}

export function getResearchSkillPrompt(): string {
    const skills = getAllSkills();
    if (skills.length === 0) return "";

    const lines = [
        "## Research Skills",
        "The workflow is governed by these local skills. Skills define process constraints; tools execute actions.",
        "",
    ];

    for (const skill of skills) {
        lines.push(`### ${skill.name}`);
        if (skill.purpose) lines.push(`Purpose: ${skill.purpose}`);
        if (skill.whenToUse) lines.push(`When to use: ${skill.whenToUse}`);
        if (skill.requiredTools.length > 0) {
            lines.push(`Required tools: ${skill.requiredTools.join(", ")}`);
        }
        if (skill.prohibitedBehaviors.length > 0) {
            lines.push("Must not:");
            for (const item of skill.prohibitedBehaviors) {
                lines.push(`- ${item}`);
            }
        }
        lines.push("");
    }

    return lines.join("\n");
}
