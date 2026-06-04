## Qué hace este PR

<!-- Una frase. Qué cambia y por qué. -->

Closes #

---

## Tipo de cambio

- [ ] `feat` — nueva funcionalidad
- [ ] `fix` — corrección de bug
- [ ] `refactor` — sin cambio de comportamiento
- [ ] `perf` — mejora de rendimiento
- [ ] `test` — tests añadidos o corregidos
- [ ] `chore` — mantenimiento, dependencias, config
- [ ] `docs` — documentación

---

## Definition of Done

### Calidad de código
- [ ] TypeScript sin errores (`npm run type-check`)
- [ ] Lint sin errores (`npm run lint`)
- [ ] Sin `any` añadidos
- [ ] Sin `console.log` en código de producción

### Testing
- [ ] Tests unitarios/integración pasando (`npm run test:unit`)
- [ ] Cobertura del tier Core ≥ 100%
- [ ] Cobertura del tier Important ≥ 80%
- [ ] Tests E2E pasando si afecta flujos críticos (`npm run test:e2e`)
- [ ] Sin `FIXME` sin issue asociado

### Seguridad (marcar N/A si no aplica)
- [ ] N/A — Sin cambios en auth, sesiones o datos sensibles
- [ ] Inputs validados con Zod en el boundary del servidor
- [ ] Sin secrets expuestos al cliente
- [ ] Headers de seguridad correctos si se modificó el middleware

### Documentación
- [ ] CLAUDE.md actualizado si cambian convenciones del proyecto
- [ ] ADR creado si es una decisión arquitectónica relevante
- [ ] `docs/testing-strategy.md` actualizado si cambia el mapa de tiers

---

## Cómo probar

<!-- Pasos para verificar el cambio manualmente. Omitir si es obvio. -->

1.
2.

---

## Screenshots (si aplica UI)

<!-- Antes / Después -->
