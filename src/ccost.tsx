// src/index.tsx
import { List, ActionPanel, Action, showToast, Toast, Color } from "@raycast/api";
import { useEffect, useState } from "react";
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

          return {
            name: m.modelName,
            cost: m.cost,
            color: colorMap[key] ?? Color.SecondaryText,
            inputTokens: m.inputTokens ?? 0,
            outputTokens: m.outputTokens ?? 0,
            totalTokens: m.totalTokens ?? 0,
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
      return `${dot} $${(m.cost ?? 0).toFixed(2)} | Input: ${m.inputTokens ?? 0} | Output: ${m.outputTokens ?? 0} | Tokens: ${m.totalTokens ?? 0} - ${m.name}`;
    });

    return [header, "", ...modelLines].join("\n");
  };

  return (
    <List isLoading={isLoading} navigationTitle="Claude Cost (12 Weeks)">
      {days.map((day) => (
        <List.Item
          key={day.date}
          icon={{ source: "calendar", tooltip: getTooltip(day) }}
          title={{ value: formatDate(day.date), tooltip: getTooltip(day) }}
          subtitle={{
            value: `${day.models.length} model${day.models.length > 1 ? "s" : ""}`,
            tooltip: getTooltip(day),
          }}
          accessories={[
            { text: { value: `In: ${day.inputTokens ?? 0}`, color: Color.SecondaryText } },
            { text: { value: `Out: ${day.outputTokens ?? 0}`, color: Color.SecondaryText } },
            { text: { value: `Tokens: ${day.totalTokens ?? 0}`, color: Color.Blue } },
            { text: { value: `$${(day.totalCost ?? 0).toFixed(2)}`, color: Color.Green } },
          ]}
          actions={
            <ActionPanel>
              <Action title="Refresh" icon="arrow.clockwise" onAction={fetch} />
            </ActionPanel>
          }
        />
      ))}

      {days.length > 0 && (
        <List.Section title="Summary">
          <List.Item
            title="12-Week Total"
            subtitle={`$${days.reduce((s, d) => s + (d.totalCost ?? 0), 0).toFixed(2)}`}
            icon={{ source: "dollarsign.circle.fill", tintColor: Color.Green }}
            accessories={[
              { text: `In: ${days.reduce((s, d) => s + (d.inputTokens ?? 0), 0)}`, color: Color.SecondaryText },
              { text: `Out: ${days.reduce((s, d) => s + (d.outputTokens ?? 0), 0)}`, color: Color.SecondaryText },
              { text: `Tokens: ${days.reduce((s, d) => s + (d.totalTokens ?? 0), 0)}`, color: Color.Blue },
            ]}
          />
        </List.Section>
      )}
    </List>
  );
}
