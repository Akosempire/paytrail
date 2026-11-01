"use client";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button, cx } from "@/components/ui";
import { allowAccess, denyAccess } from "./actions";

function Allow() {
  const { pending } = useFormStatus();
  return <Button type="submit" variant="primary" block loading={pending}>Allow</Button>;
}

const option = "flex cursor-pointer items-start gap-3 rounded-xl p-3.5 ring-1 ring-line has-[:checked]:bg-brand-soft has-[:checked]:ring-brand-line has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand";

export function ConsentForm({ params, businesses, defaultBusiness, access, readOnly, appName }) {
  const [state, action] = useActionState(async (_, form) => allowAccess(form), null);
  return (
    <form action={action} className="flex flex-col gap-5">
      {Object.entries(params).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      {businesses.length > 1 ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-medium text-ink">Which business?</legend>
          {businesses.map((b) => (
            <label key={b.id} className={option}>
              <input type="radio" name="business" value={b.id} defaultChecked={b.id === defaultBusiness} className="mt-0.5 accent-[var(--color-brand)]" />
              <span><span className="block text-sm font-medium text-ink">{b.name}</span><span className="block text-xs text-ink-3">You're {b.role}</span></span>
            </label>
          ))}
        </fieldset>
      ) : (
        <><input type="hidden" name="business" value={businesses[0].id} />
          <p className="rounded-xl bg-tray px-3.5 py-3 text-sm text-ink-2">Business: <strong className="text-ink">{businesses[0].name}</strong> <span className="text-ink-3">· you're {businesses[0].role}</span></p></>
      )}
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium text-ink">What can {appName} do?</legend>
        {Object.entries(access).filter(([k]) => !readOnly || k === "read").map(([k, a]) => (
          <label key={k} className={option}>
            <input type="radio" name="access" value={k} defaultChecked={readOnly ? k === "read" : k !== "read"} className="mt-0.5 accent-[var(--color-brand)]" />
            <span><span className="block text-sm font-medium text-ink">{a.label}</span><span className="block text-xs leading-relaxed text-ink-3">{a.summary}</span></span>
          </label>
        ))}
        <p className="text-xs text-ink-3">It can only do what your team role allows, and it asks you before sending anything. Disconnect any time in Settings → AI & MCP.</p>
      </fieldset>
      {state?.error && <p role="alert" className="text-sm text-danger">{state.error}</p>}
      <div className="flex flex-col gap-2">
        <Allow />
        <button type="submit" formAction={denyAccess} formNoValidate className={cx("h-11 rounded-xl text-sm font-medium text-ink-2 hover:bg-tray")}>Cancel</button>
      </div>
    </form>
  );
}
