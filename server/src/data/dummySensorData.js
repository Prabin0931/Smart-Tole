/*
 * Project note: Dummy Sensor Data stores backend seed or fallback data for local development.
 * Use it to keep demos reliable, but prefer database records for live system behavior.
 */
export const garbageReadings = [
  {
    id: 1,
    binId: "BIN-001",
    fillPercentage: 32,
    distanceCm: 41,
    status: "Normal",
    timestamp: "2026-03-29T08:00:00"
  },
  {
    id: 2,
    binId: "BIN-001",
    fillPercentage: 67,
    distanceCm: 22,
    status: "Warning",
    timestamp: "2026-03-29T14:00:00"
  },
  {
    id: 3,
    binId: "BIN-001",
    fillPercentage: 89,
    distanceCm: 11,
    status: "Full",
    timestamp: "2026-03-30T09:00:00"
  }
];
