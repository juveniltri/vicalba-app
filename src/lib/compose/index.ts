import { parse } from "yaml";

export function extraerServicios(content: string): string[] {
  if (!content.trim()) return [];
  try {
    const doc = parse(content) as Record<string, unknown>;
    const services = doc?.services;
    if (!services || typeof services !== "object") return [];
    return Object.keys(services);
  } catch {
    return [];
  }
}
