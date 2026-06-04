export type EstadoServicio = "running" | "stopped" | "error" | "deploying";

export type Servicio = {
  nombre: string;
  estado: EstadoServicio;
};

export type Proyecto = {
  id: string;
  nombre: string;
  clienteSlug: string;
  estado: EstadoServicio;
  servicios: Servicio[];
  dominio: string | null;
  ultimoDeploy: { hace: string; rama: string } | null;
};

export type Cliente = {
  slug: string;
  nombre: string;
  proyectos: Proyecto[];
};

export const clientes: Cliente[] = [
  {
    slug: "cliente-uno",
    nombre: "Cliente Uno",
    proyectos: [
      {
        id: "p1",
        nombre: "web-app",
        clienteSlug: "cliente-uno",
        estado: "running",
        servicios: [
          { nombre: "nginx", estado: "running" },
          { nombre: "node", estado: "running" },
        ],
        dominio: "app.cliente-uno.com",
        ultimoDeploy: { hace: "hace 2h", rama: "main" },
      },
      {
        id: "p2",
        nombre: "api",
        clienteSlug: "cliente-uno",
        estado: "stopped",
        servicios: [{ nombre: "fastapi", estado: "stopped" }],
        dominio: "api.cliente-uno.com",
        ultimoDeploy: { hace: "hace 5h", rama: "main" },
      },
    ],
  },
  {
    slug: "cliente-dos",
    nombre: "Cliente Dos",
    proyectos: [
      {
        id: "p3",
        nombre: "landing",
        clienteSlug: "cliente-dos",
        estado: "error",
        servicios: [{ nombre: "nginx", estado: "error" }],
        dominio: "landing.cliente-dos.com",
        ultimoDeploy: { hace: "hace 1d", rama: "main" },
      },
      {
        id: "p4",
        nombre: "worker",
        clienteSlug: "cliente-dos",
        estado: "deploying",
        servicios: [{ nombre: "celery", estado: "deploying" }],
        dominio: null,
        ultimoDeploy: { hace: "hace 10m", rama: "develop" },
      },
    ],
  },
];
