import { describe, expect, it } from "vitest";
import { extraerServicios } from "./index";

describe("extraerServicios", () => {
  it("extrae nombres de servicios de un compose válido", () => {
    const content = `
services:
  web:
    image: nginx:alpine
  api:
    build: .
    ports:
      - "3000:3000"
  db:
    image: postgres:16
`;
    expect(extraerServicios(content)).toEqual(["web", "api", "db"]);
  });

  it("devuelve array vacío si no hay clave services", () => {
    expect(extraerServicios("version: '3'")).toEqual([]);
  });

  it("devuelve array vacío con services vacío", () => {
    expect(extraerServicios("services: {}")).toEqual([]);
  });

  it("devuelve array vacío con YAML inválido", () => {
    expect(extraerServicios("{ invalid: yaml: content")).toEqual([]);
  });

  it("devuelve array vacío con string vacío", () => {
    expect(extraerServicios("")).toEqual([]);
  });

  it("devuelve array vacío con solo espacios", () => {
    expect(extraerServicios("   \n  ")).toEqual([]);
  });

  it("soporta compose sin clave version", () => {
    const content = `
services:
  app:
    image: myapp:latest
`;
    expect(extraerServicios(content)).toEqual(["app"]);
  });
});
