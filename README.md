# Portfolio 2026 — César Calderón

Visor web interactivo para un portafolio de arquitectura y BIM. Presenta las 34 páginas como un libro físico, con giro de página 3D, navegación por teclado y gestos, índice de miniaturas, pantalla completa, progreso y descarga del PDF original.

## Ejecutar localmente

```bash
pnpm install
pnpm dev
```

## Crear la versión de producción

```bash
pnpm build
```

La carpeta `dist/` resultante es estática y puede publicarse en GitHub Pages, Netlify, Vercel o cualquier hosting de archivos estáticos. La configuración usa rutas relativas para funcionar correctamente dentro de un subdirectorio de GitHub Pages.

## Publicar en GitHub Pages

1. Crea un repositorio y sube el contenido completo de esta carpeta a la rama `main`.
2. En GitHub abre **Settings → Pages**.
3. En **Build and deployment → Source**, selecciona **GitHub Actions**.
4. El workflow incluido en `.github/workflows/deploy-pages.yml` validará, construirá y publicará el sitio automáticamente en cada push a `main`.

## Controles

- Flechas izquierda/derecha: pasar página.
- Espacio: página siguiente.
- Inicio/Fin: portada/última página.
- Arrastrar o deslizar desde una página: giro manual.
- Índice: navegación directa por miniaturas.
- Barra inferior: salto rápido entre páginas.

## Contenido

Las páginas optimizadas están en `public/pages/`, las miniaturas en `public/thumbs/` y el PDF descargable en `public/Cesar-Calderon-Portfolio-2026.pdf`.
