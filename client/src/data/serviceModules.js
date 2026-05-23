/*
 * Project note: Service Modules stores shared reference data for the frontend.
 * Keep these values stable because routing, labels, filters, and permissions may depend on them.
 */
export const SERVICE_MODULES = [
  {
    id: "streetlight",
    title: "Streetlight Support",
    shortLabel: "Streetlights",
    icon: "lightbulb",
    description: "Broken lights and dark lanes.",
    committeeRoleType: "Streetlight Committee",
    committeeRoleLabel: "Streetlight Committee",
    categories: ["Streetlight", "Electricity", "Other Streetlight Issue"],
    categoryOptions: [
      { value: "Streetlight", label: "Streetlight" },
      { value: "Electricity", label: "Electricity" },
      { value: "Other Streetlight Issue", label: "Other" }
    ]
  },
  {
    id: "water",
    title: "Water Supply Support",
    shortLabel: "Water Supply",
    icon: "water_drop",
    description: "Supply cuts, low pressure, and leakage.",
    committeeRoleType: "Water Supply Committee",
    committeeRoleLabel: "Water Supply Committee",
    categories: ["Water Supply", "Other Water Supply Issue"],
    categoryOptions: [
      { value: "Water Supply", label: "Water Supply" },
      { value: "Other Water Supply Issue", label: "Other" }
    ]
  },
  {
    id: "drainage",
    title: "Drainage & Road Support",
    shortLabel: "Drainage & Roads",
    icon: "route",
    description: "Drainage blockages and road damage.",
    committeeRoleType: "Infrastructure Committee",
    committeeRoleLabel: "Drainage & Road Committee",
    categories: ["Drainage", "Road Damage", "Public Property Damage", "Other Drainage Or Road Issue"],
    categoryOptions: [
      { value: "Drainage", label: "Drainage" },
      { value: "Road Damage", label: "Road Damage" },
      { value: "Public Property Damage", label: "Public Property Damage" },
      { value: "Other Drainage Or Road Issue", label: "Other" }
    ]
  },
  {
    id: "garbage",
    title: "Waste & Sanitation Support",
    shortLabel: "Waste Service",
    icon: "delete",
    description: "Dustbin and sanitation issues.",
    committeeRoleType: "Sanitation Committee",
    committeeRoleLabel: "Waste & Sanitation Committee",
    categories: ["Garbage Collection", "Sanitation", "Other Waste Or Sanitation Issue"],
    categoryOptions: [
      { value: "Garbage Collection", label: "Garbage Collection" },
      { value: "Sanitation", label: "Sanitation" },
      { value: "Other Waste Or Sanitation Issue", label: "Other" }
    ]
  },
  {
    id: "safety",
    title: "Public Safety Support",
    shortLabel: "Public Safety",
    icon: "shield",
    description: "Security issues and public alerts.",
    committeeRoleType: "Public Safety Committee",
    committeeRoleLabel: "Public Safety Committee",
    categories: ["Security", "Noise Disturbance", "Public Safety Alert", "Other Public Safety Issue"],
    categoryOptions: [
      { value: "Security", label: "Security" },
      { value: "Noise Disturbance", label: "Noise Disturbance" },
      { value: "Public Safety Alert", label: "Public Safety Alert" },
      { value: "Other Public Safety Issue", label: "Other" }
    ]
  }
];

export const SPECIAL_OTHER_CATEGORY_VALUES = new Set(
  SERVICE_MODULES.flatMap((module) =>
    (module.categoryOptions || [])
      .filter((option) => option.label === "Other" && option.value !== "Other")
      .map((option) => option.value)
  )
);

const generalCategoryOptions = SERVICE_MODULES.flatMap((module) =>
  (module.categoryOptions || []).filter((option) => option.label !== "Other")
);

export const ALL_COMPLAINT_CATEGORY_OPTIONS = [
  ...Array.from(
    generalCategoryOptions.reduce((map, option) => {
      if (!map.has(option.value)) {
        map.set(option.value, option);
      }
      return map;
    }, new Map()).values()
  ),
  { value: "Other", label: "Other" }
];

export const ALL_COMPLAINT_CATEGORIES = ALL_COMPLAINT_CATEGORY_OPTIONS.map((option) => option.value);

export const SERVICE_CATEGORY_OPTIONS = SERVICE_MODULES.flatMap((module) =>
  module.categories.map((category) => ({
    category,
    moduleId: module.id
  }))
);

export function getServiceModuleByCategory(category) {
  return SERVICE_MODULES.find((module) => module.categories.includes(category)) || SERVICE_MODULES[4];
}
