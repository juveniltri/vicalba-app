# Notas pendientes

## Antes de mergear `feature/fase1-backend-auth` → `master`

La rama tiene todo implementado y revisado (54 tests, cobertura OK), pero necesita validación manual con una base de datos real.

### Pasos en orden

1. Asegúrate de tener PostgreSQL corriendo y `.env.local` con `DATABASE_URL` apuntando a la base de datos de desarrollo.

2. Aplica la migración inicial:

   ```bash
   npx prisma migrate dev
   ```

3. Pobla la base de datos con datos de prueba:

   ```bash
   npm run db:seed
   ```

   Crea dos clientes con proyectos en distintos estados y el usuario `admin@vicalba.local` / `dev-password-2026`.

4. Arranca el servidor y verifica que el dashboard carga datos reales:

   ```bash
   npm run dev
   ```

   Abre `http://localhost:3000` — debe redirigir a `/login`. Entra con las credenciales del seed y comprueba que el dashboard muestra los proyectos de la base de datos.

5. Si todo va bien, mergea a `master`.
