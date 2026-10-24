// What each team role may do. The database enforces the same rules; this
// file only decides which buttons to show.
export const ROLES = {
  owner: { label: "Owner", summary: "Everything, including billing and removing the business." },
  manager: { label: "Manager", summary: "Approves and sends documents, manages team, branding and payments." },
  finance: { label: "Finance officer", summary: "Creates, sends and records payments. Sees hidden costs." },
  junior_finance: { label: "Junior finance", summary: "Prepares drafts for approval. Hidden costs only if allowed." },
};

const RULES = {
  "documents.create": ["owner", "manager", "finance", "junior_finance"],
  "documents.send": ["owner", "manager", "finance"],
  "documents.approve": ["owner", "manager", "finance"],
  "documents.void": ["owner", "manager", "finance"],
  "documents.convert": ["owner", "manager", "finance"],
  "payments.record": ["owner", "manager", "finance"],
  "settings.business": ["owner", "manager"],
  "settings.payments": ["owner", "manager"],
  "settings.team": ["owner", "manager"],
  "settings.billing": ["owner"],
};

export function can(member, action) {
  if (!member) return false;
  if (action === "costs.view") return member.role === "owner" || member.role === "manager" || member.can_view_costs;
  return (RULES[action] || []).includes(member.role);
}
