import { formatDate } from "@/lib/format";
import { cx } from "@/components/ui";

// a message thread: the team on the left, the person on the right (from their side)
export function Conversation({ messages, you, team, teamSide = "left" }) {
  if (!messages.length) return <p className="px-5 py-6 text-sm text-ink-3">No messages yet.</p>;
  return (
    <ol className="flex flex-col gap-3 px-5 py-5">
      {messages.map((m) => {
        const left = teamSide === "left" ? m.from_team : !m.from_team;
        return (
          <li key={m.id} className={cx("flex flex-col gap-1", left ? "items-start" : "items-end")}>
            <span className="text-[11.5px] text-ink-3">{m.from_team ? team : you} · {formatDate(m.created_at, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Africa/Lagos" })}</span>
            <div className={cx("max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-4 py-2.5 text-sm leading-6",
              left ? "rounded-tl-md bg-tray text-ink" : "rounded-tr-md bg-brand text-white")}>{m.body}</div>
          </li>
        );
      })}
    </ol>
  );
}
