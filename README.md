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

### Métrica principal: fuerza del hábito

La métrica destacada no es la racha sino la **fuerza**: una media móvil exponencial (la fórmula de [Loop Habit Tracker](https://github.com/iSoron/uhabits), vida media de 13 días) donde cada día cumplido fortalece y cada día perdido debilita — pero un fallo tras un buen historial no reinicia el progreso. La racha queda como dato secundario.

El motivo es de diseño, no estético: la investigación sobre abandono de estas apps señala la *streak anxiety* como causa principal, y el efecto de violación de abstinencia ("what-the-hell effect") explica por qué un solo fallo lleva a abandonar la meta entera. Un día perdido no afecta medible­mente la formación del hábito (Lally et al., 2010), así que castigarlo con un reinicio a cero desinforma.

### Datos

Todo se guarda en el `localStorage` del navegador. La sección **Tus datos** permite:

- **Exportar CSV** en formato largo (`fecha, seccion, metrica, item, valor`), listo para pandas o Excel.
- **Respaldo JSON** completo y restaurable.
- **Importar respaldo** para migrar entre navegadores o recuperar datos.

Además de los checks, se registra una **energía diaria (1-5)** global a todas las secciones, pensada como variable de resultado para correlacionar con sueño y rutina.

Cada sección tiene su propio registro diario, resumen, calendario de constancia (heatmap) y tendencia semanal. Para agregar una sección nueva (ej. "Hábitos de sueño", "Fin de semana"), se añade una entrada en `defaultSections()` dentro de `habit-tracker/app.js` con su `type`, sus `activeDays` y sus pasos.
