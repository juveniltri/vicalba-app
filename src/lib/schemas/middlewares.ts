import { z } from "zod";

const sinSaltos = /^[^\r\n]*$/;

const ipORango = z.union([z.ipv4(), z.ipv6(), z.cidrv4(), z.cidrv6()]);

// The stored shape. Basic auth keeps only bcrypt hashes, never the password.
export const middlewaresSchema = z
  .object({
    basicAuth: z
      .object({
        usuarios: z
          .array(
            z.object({
              usuario: z.string().regex(/^[A-Za-z0-9._@-]{1,64}$/),
              hash: z.string().min(1).regex(sinSaltos),
            }),
          )
          .min(1)
          .max(20),
      })
      .optional(),
    ipPermitidas: z.array(ipORango).min(1).max(100).optional(),
    limitePeticiones: z
      .object({
        media: z.number().int().min(1).max(100_000),
        rafaga: z.number().int().min(1).max(100_000),
      })
      .optional(),
    bodyMaximoMB: z.number().int().min(1).max(10_240).optional(),
    cabeceras: z
      .object({
        hsts: z.boolean().optional(),
        nosniff: z.boolean().optional(),
        frameDeny: z.boolean().optional(),
        referrerPolicy: z
          .enum([
            "no-referrer",
            "same-origin",
            "strict-origin",
            "strict-origin-when-cross-origin",
          ])
          .optional(),
        propias: z
          .record(
            z.string().regex(/^[A-Za-z0-9-]{1,64}$/),
            z.string().max(500).regex(sinSaltos),
          )
          .optional(),
      })
      .optional(),
    compresion: z.boolean().optional(),
    // Only meaningful on a route with a path: the Servicio receives "/x" instead of "/api/x".
    quitarPrefijo: z.boolean().optional(),
  })
  .strict();

export type Middlewares = z.infer<typeof middlewaresSchema>;

// What the form sends: passwords in clear (only over the tRPC call), no hashes.
// An existing user may omit it to keep the current one.
export const middlewaresEntradaSchema = middlewaresSchema.extend({
  basicAuth: z
    .object({
      usuarios: z
        .array(
          z.object({
            usuario: z.string().regex(/^[A-Za-z0-9._@-]{1,64}$/),
            contrasena: z.string().min(8).max(128).optional(),
          }),
        )
        .min(1)
        .max(20),
    })
    .optional(),
});

export type MiddlewaresEntrada = z.infer<typeof middlewaresEntradaSchema>;
