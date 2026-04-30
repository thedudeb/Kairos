// Pure presentational component — works in server and client components.

const PALETTE = [
  "#6366f1", // indigo
  "#8b5cf6", // violet
  "#0ea5e9", // sky
  "#10b981", // emerald
  "#f59e0b", // amber
  "#f43f5e", // rose
  "#ec4899", // pink
  "#14b8a6", // teal
  "#f97316", // orange
  "#84cc16", // lime
];

function hashName(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = (h * 31 + name.charCodeAt(i)) & 0x7fffffff;
  }
  return h;
}

function getColor(firstName: string, lastName: string): string {
  return PALETTE[hashName(`${firstName}${lastName}`) % PALETTE.length];
}

function getInitials(firstName: string, lastName: string): string {
  return `${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase();
}

interface ApplicantAvatarProps {
  firstName: string;
  lastName: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const SIZE = {
  sm: { outer: "h-8 w-8",   text: "text-xs font-semibold" },
  md: { outer: "h-10 w-10", text: "text-sm font-semibold" },
  lg: { outer: "h-14 w-14", text: "text-lg font-bold" },
};

export function ApplicantAvatar({
  firstName,
  lastName,
  size = "md",
  className = "",
}: ApplicantAvatarProps) {
  const color    = getColor(firstName, lastName);
  const initials = getInitials(firstName, lastName);
  const s        = SIZE[size];

  return (
    <div
      className={`${s.outer} shrink-0 select-none rounded-full flex items-center justify-center ${className}`}
      style={{ backgroundColor: color }}
      aria-label={`${firstName} ${lastName}`}
    >
      <span className={`${s.text} text-white leading-none`}>{initials}</span>
    </div>
  );
}
