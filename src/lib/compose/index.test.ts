import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import {
  encontrarServicioPorPuerto,
  extraerServicios,
  generarOverrideLogging,
} from "./index";

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

describe("encontrarServicioPorPuerto", () => {
  const stackDjango = `
services:
  db:
    image: postgres:16
  web:
    build: ../crm
    expose:
      - "8000"
  worker:
    build: ../crm
    command: celery worker
  beat:
    build: ../crm
    command: celery beat
`;

  it("identifica el servicio que declara expose con el puerto", () => {
    expect(encontrarServicioPorPuerto(stackDjango, 8000)).toBe("web");
  });

  it("no confunde servicios sin expose/ports aunque compartan imagen", () => {
    expect(encontrarServicioPorPuerto(stackDjango, 8000)).not.toBe("worker");
    expect(encontrarServicioPorPuerto(stackDjango, 8000)).not.toBe("beat");
  });

  it("identifica el servicio por ports con mapeo host:contenedor", () => {
    const content = `
services:
  api:
    build: .
    ports:
      - "3000:3000"
`;
    expect(encontrarServicioPorPuerto(content, 3000)).toBe("api");
  });

  it("soporta ports con IP:host:contenedor", () => {
    const content = `
services:
  api:
    ports:
      - "127.0.0.1:8080:3000"
`;
    expect(encontrarServicioPorPuerto(content, 3000)).toBe("api");
  });

  it("soporta puerto con sufijo /tcp", () => {
    const content = `
services:
  api:
    expose:
      - "3000/tcp"
`;
    expect(encontrarServicioPorPuerto(content, 3000)).toBe("api");
  });

  it("soporta puerto declarado como número", () => {
    const content = `
services:
  api:
    expose:
      - 3000
`;
    expect(encontrarServicioPorPuerto(content, 3000)).toBe("api");
  });

  it("devuelve undefined si ningún servicio declara el puerto", () => {
    expect(encontrarServicioPorPuerto(stackDjango, 9999)).toBeUndefined();
  });

  it("devuelve undefined si un servicio se declara sin propiedades (null)", () => {
    const content = `
services:
  worker:
`;
    expect(encontrarServicioPorPuerto(content, 8000)).toBeUndefined();
  });

  it("devuelve undefined si un servicio no tiene expose ni ports", () => {
    const content = `
services:
  worker:
    build: .
    command: celery worker
`;
    expect(encontrarServicioPorPuerto(content, 8000)).toBeUndefined();
  });

  it("devuelve undefined sin clave services", () => {
    expect(encontrarServicioPorPuerto("version: '3'", 8000)).toBeUndefined();
  });

  it("devuelve undefined con services vacío", () => {
    expect(encontrarServicioPorPuerto("services: {}", 8000)).toBeUndefined();
  });

  it("devuelve undefined con YAML inválido", () => {
    expect(
      encontrarServicioPorPuerto("{ invalid: yaml: content", 8000),
    ).toBeUndefined();
  });

  it("devuelve undefined con string vacío", () => {
    expect(encontrarServicioPorPuerto("", 8000)).toBeUndefined();
  });
});

describe("generarOverrideLogging", () => {
  it("limita los logs de cada servicio a 3 ficheros de 10 MB", () => {
    const override = generarOverrideLogging(`
services:
  web:
    image: nginx
  db:
    image: postgres
`);
    const limite = {
      driver: "json-file",
      options: { "max-size": "10m", "max-file": "3" },
    };
    expect(parse(override!)).toEqual({
      services: { web: { logging: limite }, db: { logging: limite } },
    });
  });

  it("respeta los servicios que ya configuran su logging", () => {
    const override = generarOverrideLogging(`
services:
  web:
    image: nginx
  db:
    image: postgres
    logging:
      driver: local
`);
    expect(Object.keys(parse(override!).services)).toEqual(["web"]);
  });

  it("no genera override si no hay ningún servicio sin limitar", () => {
    expect(
      generarOverrideLogging(
        "services:\n  db:\n    logging:\n      driver: local\n",
      ),
    ).toBeNull();
    expect(generarOverrideLogging("services: {}")).toBeNull();
    expect(generarOverrideLogging("version: '3'")).toBeNull();
    expect(generarOverrideLogging("{ invalid: yaml: content")).toBeNull();
  });

  it("limita también un servicio declarado sin definición", () => {
    const override = generarOverrideLogging("services:\n  web:\n");
    expect(Object.keys(parse(override!).services)).toEqual(["web"]);
  });
});
