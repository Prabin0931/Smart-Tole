/*
 * Project note: Committee Roles stores shared reference data for the frontend.
 * Keep these values stable because routing, labels, filters, and permissions may depend on them.
 */
export const ROLE_OPTIONS = [
  {
    value: "Super Admin",
    label: "System Administrator",
    description: "Full platform access.",
    aliases: ["System Administrator"]
  },
  {
    value: "Committee Member",
    label: "Community Service Committee",
    description: "General community service support.",
    aliases: ["General Committee", "General Committee Member", "Community Service Support"],
    selectable: false
  },
  {
    value: "Streetlight Committee",
    label: "Streetlight Committee",
    description: "Handles streetlight issues.",
    aliases: ["Streetlight Support Lead"]
  },
  {
    value: "Water Supply Committee",
    label: "Water Supply Committee",
    description: "Handles water supply issues.",
    aliases: ["Water Supply Support Lead"]
  },
  {
    value: "Infrastructure Committee",
    label: "Drainage & Road Committee",
    description: "Handles drainage and road issues.",
    aliases: ["Drainage & Road Support Lead", "Roads, Drainage, and Streetlight Lead"]
  },
  {
    value: "Sanitation Committee",
    label: "Waste & Sanitation Committee",
    description: "Handles waste and sanitation issues.",
    aliases: ["Waste & Sanitation Support Lead", "Waste and Sanitation Lead"]
  },
  {
    value: "Public Safety Committee",
    label: "Public Safety Committee",
    description: "Handles safety and security issues.",
    aliases: ["Public Safety Support Lead"]
  },
  {
    value: "Communication Committee",
    label: "Notice & Communication Committee",
    description: "Handles notices and updates.",
    aliases: ["Notice & Communication Lead", "Notice and Communication Lead"],
    selectable: false
  },
  {
    value: "Support Operator",
    label: "Complaint Support Committee",
    description: "Helps route and follow up complaints.",
    aliases: ["Complaint Support Operator"],
    selectable: false
  }
];

export const ASSIGNABLE_ROLE_OPTIONS = ROLE_OPTIONS.filter((option) => option.selectable !== false);

function getRoleDefinition(roleType) {
  return ROLE_OPTIONS.find(
    (option) => option.value === roleType || option.aliases?.includes(roleType)
  );
}

export function getRoleLabel(roleType) {
  return getRoleDefinition(roleType)?.label || roleType;
}

export function getRoleDescription(roleType) {
  return getRoleDefinition(roleType)?.description || "";
}
