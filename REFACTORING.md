# Guía de Refactoring

## Cuándo refactorizar

Refactoriza cuando el código dificulta añadir la siguiente funcionalidad, no como tarea independiente. Un refactor sin test que lo respalde no se aprueba.

## Etiquetas en el código

Usa estas etiquetas con el formato exacto — los editores y el CI las detectan:

| Etiqueta | Significado | ¿Bloquea release? |
|---|---|---|
| `TODO: descripción` | Mejora conocida, no urgente | No |
| `FIXME: descripción` | Bug conocido, debe resolverse | Sí — antes del próximo release |
| `HACK: descripción + fecha` | Workaround temporal | No — pero requiere issue abierto |
| `NOTE: descripción` | Contexto no obvio para futuros lectores | No |

### Reglas de uso

- Nunca dejes un `FIXME` pasar a `main` sin issue asociado
- Los `HACK` deben incluir la fecha y una condición de revisión: `HACK: workaround para bug de librería X — revisar en v2.0 o cuando actualicen`
- No uses `TODO` para trabajo pendiente de la tarea actual — eso va en el issue tracker

---

## Estrategia de clases/módulos no implementados

Cuando quieras dejar la estructura preparada sin implementar la lógica:

```typescript
// Opción 1 — método no implementado
class PaymentService {
  processRefund(orderId: string): Promise<void> {
    // TODO: implementar integración con Stripe refunds API
    throw new Error('Not implemented')
  }
}

// Opción 2 — stub con tipo correcto
function calculateTax(amount: number, region: string): number {
  // FIXME: lógica de cálculo pendiente — usar tabla de tipos por región
  return 0
}
```

Siempre que lances `throw new Error('Not implemented')`, añade un `TODO` o `FIXME` encima.

---

## Principios de refactor

**Tres instancias hacen una abstracción** — no antes. Si ves el mismo patrón tres veces, entonces extrae.

**Altitud correcta** — no mezcles lógica de negocio con detalles de infraestructura en la misma función.

**Sin backwards-compatibility por defecto** — si algo no se usa, se borra. No se renombra a `_oldMethod`, no se exporta de más.

**Refactor con tests, nunca sin ellos** — si no hay test que cubra el código que vas a mover, escríbelo primero.

---

## Checklist antes de un PR de refactor

- [ ] Los tests existentes siguen pasando sin modificar su comportamiento
- [ ] La cobertura no bajó del umbral de su tier (100/80/0)
- [ ] No hay `FIXME` nuevos sin issue asociado
- [ ] No se añadieron abstracciones que no justifique el código actual
- [ ] El CHANGELOG refleja el refactor si afecta a la API pública
