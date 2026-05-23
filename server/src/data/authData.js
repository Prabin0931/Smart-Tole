/*
 * Project note: Auth Data stores backend seed or fallback data for local development.
 * Use it to keep demos reliable, but prefer database records for live system behavior.
 */
export const residents = [
  {
    id: 1,
    fullName: "Demo Resident",
    email: "resident@tole.com",
    phone: "9800000000",
    password: "resident123"
  }
];

export const admins = [
  {
    id: 1,
    username: "admin",
    password: "admin123",
    name: "System Admin"
  }
];
