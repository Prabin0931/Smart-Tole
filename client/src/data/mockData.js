/*
 * Project note: Mock Data stores shared reference data for the frontend.
 * Keep these values stable because routing, labels, filters, and permissions may depend on them.
 */
export const notices = [
  { id: 1, title: "Community Cleaning Day", content: "Residents are requested to join the cleaning drive this Saturday at 8 AM.", date: "2026-03-28" },
  { id: 2, title: "Water Supply Maintenance", content: "Water supply may be interrupted on Tuesday from 10 AM to 1 PM.", date: "2026-03-29" }
];

export const complaints = [
  { id: 1, subject: "Streetlight not working", category: "Streetlight", status: "Pending", createdAt: "2026-03-26" },
  { id: 2, subject: "Water leakage near gate", category: "Water", status: "In Progress", createdAt: "2026-03-27" },
  { id: 3, subject: "Garbage overflow", category: "Sanitation", status: "Resolved", createdAt: "2026-03-28" }
];

export const residents = [
  { id: 1, name: "Asha Rai", houseNo: "A-12", phone: "9800000001" },
  { id: 2, name: "Suman Lama", houseNo: "B-04", phone: "9800000002" },
  { id: 3, name: "Pratik Shrestha", houseNo: "C-07", phone: "9800000003" }
];

export const garbageReadings = [
  { id: 1, binId: "BIN-001", fillPercentage: 32, status: "Normal", timestamp: "2026-03-29 08:00" },
  { id: 2, binId: "BIN-001", fillPercentage: 67, status: "Warning", timestamp: "2026-03-29 14:00" },
  { id: 3, binId: "BIN-001", fillPercentage: 89, status: "Full", timestamp: "2026-03-30 09:00" }
];
