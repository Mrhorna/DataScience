# DataScience

Repositorio de ciencia de datos.

## Proyectos

- [`habit-tracker/`](habit-tracker) — **Mi Sistema**: dashboard web para gestionar mi tiempo por secciones. Sin backend: los datos se guardan en el navegador. Para usarlo, abre `habit-tracker/index.html` o sírvelo con cualquier servidor estático.

### Secciones

| Sección | Tipo | Días | Qué mide |
|---|---|---|---|
| **Perfect Start** | rutina encadenada | L-V | Racha de rutinas completas, % de rutina completa, hora real de despertar vs. ventana meta, y el eslabón más débil de la cadena |
| **Hábitos** | hábitos sueltos | todos | Racha y % de cumplimiento por hábito |

Cada sección tiene su propio registro diario, resumen, calendario de constancia (heatmap) y tendencia semanal. Para agregar una sección nueva (ej. "Hábitos de sueño", "Fin de semana"), se añade una entrada en `defaultSections()` dentro de `habit-tracker/app.js` con su `type`, sus `activeDays` y sus pasos.
