import type { SVGProps } from "react";

export type IconProps = SVGProps<SVGSVGElement>;

const S = (p: IconProps): SVGProps<SVGSVGElement> => ({
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  ...p,
});

export const IconGrid = (p: IconProps) => (
  <svg {...S(p)}>
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
    <rect x="14" y="14" width="7" height="7" rx="1" />
  </svg>
);
export const IconDeploy = (p: IconProps) => (
  <svg {...S(p)}>
    <path d="M12 3v12m0 0l4-4m-4 4l-4-4" />
    <path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
  </svg>
);
export const IconGlobe = (p: IconProps) => (
  <svg {...S(p)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3c2.5 2.5 2.5 15.5 0 18M12 3c-2.5 2.5-2.5 15.5 0 18" />
  </svg>
);
export const IconLogs = (p: IconProps) => (
  <svg {...S(p)}>
    <path d="M5 6h14M5 10h10M5 14h14M5 18h7" />
  </svg>
);
export const IconUsers = (p: IconProps) => (
  <svg {...S(p)}>
    <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" />
    <circle cx="9" cy="7" r="4" />
  </svg>
);
export const IconGear = (p: IconProps) => (
  <svg {...S(p)}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19 12a7 7 0 00-.1-1l2-1.5-2-3.4-2.3 1a7 7 0 00-1.7-1l-.3-2.6h-4l-.3 2.6a7 7 0 00-1.7 1l-2.3-1-2 3.4 2 1.5a7 7 0 000 2l-2 1.5 2 3.4 2.3-1a7 7 0 001.7 1l.3 2.6h4l.3-2.6a7 7 0 001.7-1l2.3 1 2-3.4-2-1.5a7 7 0 00.1-1z" />
  </svg>
);
export const IconLock = (p: IconProps) => (
  <svg {...S(p)} strokeWidth={2}>
    <rect x="5" y="11" width="14" height="9" rx="2" />
    <path d="M8 11V8a4 4 0 018 0v3" />
  </svg>
);
export const IconClock = (p: IconProps) => (
  <svg {...S(p)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
);
export const IconRedeploy = (p: IconProps) => (
  <svg {...S(p)}>
    <path d="M4 12a8 8 0 0114-5M20 12a8 8 0 01-14 5" />
    <path d="M18 3v4h-4M6 21v-4h4" />
  </svg>
);
export const IconStop = (p: IconProps) => (
  <svg {...S(p)} fill="currentColor" stroke="none">
    <rect x="7" y="7" width="10" height="10" rx="1.5" />
  </svg>
);
export const IconRollback = (p: IconProps) => (
  <svg {...S(p)}>
    <path d="M9 14L4 9l5-5" />
    <path d="M4 9h11a5 5 0 015 5 5 5 0 01-5 5H7" />
  </svg>
);
export const IconBranch = (p: IconProps) => (
  <svg {...S(p)}>
    <circle cx="6" cy="6" r="2.5" />
    <circle cx="6" cy="18" r="2.5" />
    <circle cx="18" cy="8" r="2.5" />
    <path d="M6 8.5v7M18 10.5c0 4-6 1-6 5.5" />
  </svg>
);
export const IconEdit = (p: IconProps) => (
  <svg {...S(p)}>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4z" />
  </svg>
);
export const IconCpu = (p: IconProps) => (
  <svg {...S(p)}>
    <rect x="7" y="7" width="10" height="10" rx="1" />
    <path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3" />
  </svg>
);
export const IconRam = (p: IconProps) => (
  <svg {...S(p)}>
    <rect x="4" y="6" width="16" height="12" rx="1.5" />
    <path d="M8 6v12M12 6v12M16 6v12" />
  </svg>
);
export const IconPlus = (p: IconProps) => (
  <svg {...S(p)} strokeWidth={2}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);
export const IconWarn = (p: IconProps) => (
  <svg {...S(p)} strokeWidth={1.9}>
    <path d="M10.3 3.9L2 18a2 2 0 001.7 3h16.6a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" />
    <path d="M12 9v4M12 17h.01" />
  </svg>
);
export const IconCheck = (p: IconProps) => (
  <svg {...S(p)} strokeWidth={2.2}>
    <path d="M5 12l4 4L19 6" />
  </svg>
);
export const IconAlert = (p: IconProps) => (
  <svg {...S(p)} strokeWidth={2}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 8v5M12 16h.01" />
  </svg>
);
export const IconX = (p: IconProps) => (
  <svg {...S(p)} strokeWidth={2}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);
