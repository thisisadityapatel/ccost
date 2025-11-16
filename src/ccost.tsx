// src/index.tsx
import { List, ActionPanel, Action, showToast, Toast, Color } from "@raycast/api";
import { useEffect, useState } from "react";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

interface Model {
  name: string;
  cost: number;
  color: Color;
}

interface Day {
  date: string;
  totalCost: number;
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
  const [totalCost, setTotalCost] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const fetch = async () => {
    setIsLoading(true);
    try {
      const raw = await run("npx ccusage@latest daily --json");
      const data = JSON.parse(raw);
      if (!data.daily?.length) throw new Error("No usage data");

      const now = new Date();
      const weekAgo = new Date(now);
      weekAgo.setDate(now.getDate() - 6);

      const recent = data.daily
        .filter((d: any) => new Date(d.date) >= weekAgo)
        .sort((a: any, b: any) => new Date(b.date) - new Date(a.date))
        .slice(0, 7);

      const colorMap: Record<string, Color> = {
        sonnet: Color.Green,
        haiku: Color.Blue,
        opus: Color.Purple,
      };

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
            name: m.modelName.replace(/-\d{8}.*$/, ""),
            cost: m.cost,
            color: colorMap[key] ?? Color.SecondaryText,
          };
        });
        return {
          date: d.date.split("T")[0],
          totalCost: d.totalCost,
          models,
        };
      });

      const weekTotal = normalized.reduce((s, d) => s + d.totalCost, 0);
      setDays(normalized);
      setTotalCost(weekTotal);
    } catch (e: any) {
      showToast({ style: Toast.Style.Failure, title: "Error", message: e.message });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetch();
  }, []);

  const formatLocalDate = (isoString: string): string =>
    new Date(isoString).toLocaleDateString("en-CA", {
      timeZone: "America/Toronto",
      month: "short",
      day: "numeric",
    });

  const getTooltip = (day: Day): string => {
    const header = `${formatLocalDate(day.date)} — $${day.totalCost.toFixed(2)}`;
    if (!day.models.length) return header;

    const modelLines = day.models.map(m => {
      const dot =
        m.color === Color.Green ? "🟢" :
        m.color === Color.Blue ? "🔵" :
        m.color === Color.Purple ? "🟣" : "⚫";
      return `${dot} $${m.cost.toFixed(2)} - ${m.name}`;
    });

    return [header, "", ...modelLines].join("\n");
  };

  return (
    <List isLoading={isLoading} navigationTitle="Claude Cost (7d)">
      {days.map(day => (
        <List.Item
          key={day.date}
          icon={{ source: "calendar", tooltip: getTooltip(day) }}
          title={{ value: formatLocalDate(day.date), tooltip: getTooltip(day) }}
          subtitle={{ value: `${day.models.length} model${day.models.length > 1 ? "s" : ""}`, tooltip: getTooltip(day) }}
          accessories={[{ text: { value: `$${day.totalCost.toFixed(2)}`, color: Color.Green }, tooltip: getTooltip(day) }]}
          actions={
            <ActionPanel>
              <Action title="Refresh" icon="arrow.clockwise" onAction={fetch} />
            </ActionPanel>
          }
        />
      ))}

      {totalCost > 0 && (
        <List.Section title="Summary">
          <List.Item
            title="7-Day Total"
            subtitle={`$${totalCost.toFixed(2)}`}
            icon={{ source: "dollarsign.circle.fill", tintColor: Color.Green }}
            accessories={[{ text: "Last 7 days" }]}
          />
        </List.Section>
      )}
    </List>
  );
}