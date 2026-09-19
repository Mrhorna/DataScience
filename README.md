# DataScience

Repositorio de ciencia de datos.

## Proyectos

- [`habit-tracker/`](habit-tracker) — **Mi Sistema**: dashboard web para gestionar mi tiempo por secciones. Sin backend: los datos se guardan en el navegador. Para usarlo, abre `habit-tracker/index.html` o sírvelo con cualquier servidor estático.

### Secciones

| Sección | Tipo | Días | Qué mide |
|---|---|---|---|
| **Perfect Start** | rutina encadenada | L-V | Racha de rutinas completas, % de rutina completa, hora real de despertar vs. ventana meta, y el eslabón más débil de la cadena |
| **Hábitos de sueño** | medición de tiempo | todos | Horas dormidas (hora de acostarse → hora de despertar), % de noches que alcanzan la meta de 7h, racha, hora promedio de acostarse vs. ventana 22:20-22:30, y hábitos de apoyo |
| **Hábitos** | hábitos sueltos | todos | Racha y % de cumplimiento por hábito |

La hora de despertar es un dato compartido: se registra desde Perfect Start o desde Hábitos de sueño, y ambas secciones leen el mismo valor.

Cada sección tiene su propio registro diario, resumen, calendario de constancia (heatmap) y tendencia semanal. Para agregar una sección nueva (ej. "Hábitos de sueño", "Fin de semana"), se añade una entrada en `defaultSections()` dentro de `habit-tracker/app.js` con su `type`, sus `activeDays` y sus pasos.
