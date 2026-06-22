// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import {
  IconGrid,
  IconDeploy,
  IconGlobe,
  IconLogs,
  IconUsers,
  IconGear,
  IconLock,
  IconClock,
  IconRedeploy,
  IconStop,
  IconRollback,
  IconBranch,
  IconEdit,
  IconCpu,
  IconRam,
  IconPlus,
  IconWarn,
  IconCheck,
  IconAlert,
  IconX,
} from "./icons";

describe("icons", () => {
  const icons = [
    IconGrid,
    IconDeploy,
    IconGlobe,
    IconLogs,
    IconUsers,
    IconGear,
    IconLock,
    IconClock,
    IconRedeploy,
    IconStop,
    IconRollback,
    IconBranch,
    IconEdit,
    IconCpu,
    IconRam,
    IconPlus,
    IconWarn,
    IconCheck,
    IconAlert,
    IconX,
  ];

  it("renderiza todos los iconos sin errores", () => {
    icons.forEach((Icon) => {
      const { container } = render(<Icon />);
      expect(container.querySelector("svg")).not.toBeNull();
    });
  });

  it("acepta className y la aplica al svg", () => {
    const { container } = render(<IconGrid className="w-4 h-4" />);
    expect(container.querySelector("svg")).toHaveClass("w-4");
  });
});
