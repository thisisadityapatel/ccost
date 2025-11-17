// src/index.tsx
import { List, ActionPanel, Action, showToast, Toast, Color, Icon } from "@raycast/api";
import { useEffect, useState, useMemo } from "react";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

interface Model {
  name: string;
  cost?: number;
  color: Color;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

interface Day {
  date: string;
  totalCost?: number;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  models: Model[];
}

interface ModelSummary {
  name: string;
  cost: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  color: Color;
}

async function run(cmd: string): Promise<string> {
  const shell = process.env.SHELL?.includes("zsh") ? "zsh" : "bash";
  const { stdout, stderr } = await execAsync(`${shell} -l -c "${cmd.replace(/"/g, '\\"')}"`);
  if (stderr && !stdout.trim()) throw new Error(stderr);
  return stdout.trim();
}

export default function Command() {
  const [days, setDays] = useState<Day[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetch = async () => {
    setIsLoading(true);
    try {
      const raw = await run("npx ccusage@latest weekly --json");
      const data = JSON.parse(raw);
      if (!data.weekly?.length) throw new Error("No usage data");

      const colorMap: Record<string, Color> = {
        sonnet: Color.Blue,
        haiku: Color.Purple,
        opus: Color.Green,
      };

      const now = new Date();
      const twelveWeeksAgo = new Date(now);
      twelveWeeksAgo.setDate(now.getDate() - 12 * 7);

      const recent = data.weekly
        .filter((d: any) => new Date(d.week) >= twelveWeeksAgo)
        .sort((a: any, b: any) => new Date(b.week).getTime() - new Date(a.week).getTime());

      const normalized: Day[] = recent.map((d: any) => {
        const models = (d.modelBreakdowns ?? []).map((m: any) => {
          const key = m.modelName.includes("sonnet")
            ? "sonnet"
            : m.modelName.includes("haiku")
              ? "haiku"
              : m.modelName.includes("opus")
                ? "opus"
                : "gray";

          const inputTokens = m.inputTokens ?? 0;
          const outputTokens = m.outputTokens ?? 0;
          const cacheCreationTokens = m.cacheCreationTokens ?? 0;
          const cacheReadTokens = m.cacheReadTokens ?? 0;
          const totalTokens = inputTokens + outputTokens + cacheCreationTokens + cacheReadTokens;

          return {
            name: m.modelName,
            cost: m.cost,
            color: colorMap[key] ?? Color.SecondaryText,
            inputTokens: inputTokens,
            outputTokens: outputTokens,
            totalTokens: totalTokens,
          };
        });

        return {
          date: d.week,
          totalCost: d.totalCost,
          inputTokens: d.inputTokens,
          outputTokens: d.outputTokens,
          totalTokens: d.totalTokens,
          models,
        };
      });

      setDays(normalized);
    } catch (e: any) {
      showToast({ style: Toast.Style.Failure, title: "Error", message: e.message });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetch();
  }, []);

  const modelSummary = useMemo(() => {
    const summary: Record<string, ModelSummary> = {
      opus: { name: "Opus (Total)", cost: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, color: Color.Green },
      sonnet: { name: "Sonnet", cost: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, color: Color.Blue },
      haiku: { name: "Haiku", cost: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, color: Color.Purple },
      other: { name: "Other", cost: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, color: Color.SecondaryText },
    };

    for (const day of days) {
      for (const model of day.models) {
        let key: "opus" | "sonnet" | "haiku" | "other" = "other";
        if (model.name.includes("opus")) key = "opus";
        else if (model.name.includes("sonnet")) key = "sonnet";
        else if (model.name.includes("haiku")) key = "haiku";

        summary[key].cost += model.cost ?? 0;
        summary[key].inputTokens += model.inputTokens ?? 0;
        summary[key].outputTokens += model.outputTokens ?? 0;
        summary[key].totalTokens += model.totalTokens ?? 0;
      }
    }

    return Object.values(summary).filter((m) => m.totalTokens > 0);
  }, [days]);

  const formatDate = (isoString: string): string =>
    new Date(isoString).toLocaleDateString("en-CA", {
      timeZone: "America/Toronto",
      month: "short",
      day: "numeric",
    });

  const getTooltip = (day: Day): string => {
    const header = `${formatDate(day.date)} — $${(day.totalCost ?? 0).toFixed(2)} | ${day.totalTokens ?? 0} tokens`;
    if (!day.models.length) return header;

    const modelLines = day.models.map((m) => {
      const dot =
        m.color === Color.Green ? "🟢" : m.color === Color.Blue ? "🔵" : m.color === Color.Purple ? "🟣" : "⚫";
      return `${dot} $${(m.cost ?? 0).toFixed(2)} - ${m.name}`;
    });

    return [header, "", ...modelLines].join("\n");
  };

  return (
    <List isLoading={isLoading} navigationTitle="Claude Cost (12 Weeks)">
      <List.Section title="CCost - Claude Code Costs">
        {days.map((day) => (
          <List.Item
            key={day.date}
            icon={{ source: Icon.Calendar, tooltip: getTooltip(day) }}
            title={{ value: formatDate(day.date), tooltip: getTooltip(day) }}
            subtitle={{
              value: `${day.models.length} model${day.models.length > 1 ? "s" : ""}`,
              tooltip: getTooltip(day),
            }}
            accessories={[
              { text: { value: `In: ${day.inputTokens ?? 0}`, color: Color.SecondaryText } },
              { text: { value: `Out: ${day.outputTokens ?? 0}`, color: Color.SecondaryText } },
              { text: { value: `Tokens: ${day.totalTokens ?? 0}`, color: Color.Blue } },
              // --- MODIFIED: Changed this from `text` to `tag` ---
              { tag: { value: `$${(day.totalCost ?? 0).toFixed(2)}`, color: Color.Green } },
            ]}
            actions={
              <ActionPanel>
                <Action title="Refresh" icon="arrow.clockwise" onAction={fetch} />
              </ActionPanel>
            }
          />
        ))}
      </List.Section>

      {days.length > 0 && (
        <List.Section title="Summary">
          <List.Item
            title="12-Week Total"
            // --- MODIFIED: Removed subtitle ---
            icon={{ source: Icon.Coins, tintColor: Color.Green }}
            accessories={[
              { text: { value: `In: ${days.reduce((s, d) => s + (d.inputTokens ?? 0), 0)}`, color: Color.SecondaryText } },
              { text: { value: `Out: ${days.reduce((s, d) => s + (d.outputTokens ?? 0), 0)}`, color: Color.SecondaryText } },
              { text: { value: `Tokens: ${days.reduce((s, d) => s + (d.totalTokens ?? 0), 0)}`, color: Color.Blue } },
              // --- MODIFIED: Added cost as a green tag ---
              { tag: { value: `$${days.reduce((s, d) => s + (d.totalCost ?? 0), 0).toFixed(2)}`, color: Color.Green } },
            ]}
          />

          {modelSummary.map((model) => (
            <List.Item
              key={model.name}
              title={model.name}
              // --- MODIFIED: Removed subtitle ---
              icon={{ source: Icon.Circle, tintColor: model.color }}
              accessories={[
                { text: { value: `In: ${model.inputTokens}`, color: Color.SecondaryText } },
                { text: { value: `Out: ${model.outputTokens}`, color: Color.SecondaryText } },
                { text: { value: `Tokens: ${model.totalTokens}`, color: Color.Blue } },
                // --- MODIFIED: Added cost as a green tag ---
                { tag: { value: `$${model.cost.toFixed(2)}`, color: Color.Green } },
              ]}
            />
          ))}
        </List.Section>
      )}
    </List>
  );
}